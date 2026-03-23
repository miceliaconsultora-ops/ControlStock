import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  SafeAreaView,
  Animated,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, SessionScan } from '../types';
import { hydrateScan, isDuplicateInSession, getSessionScanCount } from '../services/hydrationService';
import WebCameraScanner from '../components/WebCameraScanner';

type Props = NativeStackScreenProps<RootStackParamList, 'Scanner'>;

const DEBOUNCE_MS = 1500;

export default function ScannerScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const [recentScans, setRecentScans] = useState<SessionScan[]>([]);
  const [totalScans, setTotalScans] = useState(0);
  const [lastFeedback, setLastFeedback] = useState<'success' | 'duplicate' | 'pending' | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const lastScanTime = useRef<number>(0);
  const scannedIdsRef = useRef<Set<string>>(new Set());
  const feedbackAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  const [showWebCamera, setShowWebCamera] = useState(false);

  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    if (!isWeb && !permission?.granted) {
      requestPermission();
    }
  }, [permission, isWeb]);

  const flashFeedback = (type: 'success' | 'duplicate' | 'pending') => {
    setLastFeedback(type);
    feedbackAnim.setValue(1);
    Animated.timing(feedbackAnim, {
      toValue: 0,
      duration: 1200,
      useNativeDriver: true,
    }).start(() => setLastFeedback(null));
  };

  const processBarcode = async (rawData: string) => {
    const now = Date.now();

    // Debounce: ignore scans within 1.5s of the last
    if (now - lastScanTime.current < DEBOUNCE_MS) return;
    lastScanTime.current = now;

    const idBarra = rawData.trim();
    if (!idBarra) return;

    setIsProcessing(true);

    // In-memory duplicate check (instant)
    if (scannedIdsRef.current.has(idBarra)) {
      if (!isWeb) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      flashFeedback('duplicate');
      Alert.alert('⚠️ Duplicado', `El código ${idBarra} ya fue escaneado en esta sesión.`);
      setIsProcessing(false);
      return;
    }

    // DB-level duplicate check (safety net)
    const dup = await isDuplicateInSession(idBarra, sessionId);
    if (dup) {
      scannedIdsRef.current.add(idBarra);
      if (!isWeb) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      flashFeedback('duplicate');
      Alert.alert('⚠️ Duplicado', `El código ${idBarra} ya fue escaneado en esta sesión.`);
      setIsProcessing(false);
      return;
    }

    // Valid scan → hydrate
    try {
      const scan = await hydrateScan(idBarra, sessionId);
      scannedIdsRef.current.add(idBarra);

      if (!isWeb) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      flashFeedback(scan.status === 'hydrated' ? 'success' : 'pending');

      // Add to recent scans (keep last 10)
      setRecentScans((prev) => [scan, ...prev].slice(0, 10));

      // Update total count
      const count = await getSessionScanCount(sessionId);
      setTotalScans(count);
    } catch (err) {
      console.error('Scan error:', err);
      if (!isWeb) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    await processBarcode(data);
  };

  const handleManualSubmit = async () => {
    const code = manualInput.trim();
    if (!code) return;
    setManualInput('');
    await processBarcode(code);
    // Re-focus input for quick successive scans
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleGoToReview = () => {
    navigation.navigate('Review', { sessionId });
  };

  const feedbackColor =
    lastFeedback === 'success'
      ? '#22C55E'
      : lastFeedback === 'duplicate'
      ? '#EF4444'
      : lastFeedback === 'pending'
      ? '#F59E0B'
      : 'transparent';

  // ── WEB MODE ──────────────────────────────────────────────────────────────
  if (isWeb) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
          {/* Header */}
          <View style={styles.webHeader}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backBtnText}>← Volver</Text>
            </TouchableOpacity>
            <Text style={styles.webHeaderTitle}>📦 Sesión de Escaneo</Text>
            <Text style={styles.webSubtitle}>Escaneá con la cámara, lector USB, o ingreso manual.</Text>
            <Text style={styles.sessionLabel}>ID: {sessionId.substring(0, 12)}...</Text>
          </View>

          {/* Counter + Feedback */}
          <View style={styles.counterBar}>
            <Text style={styles.counterText}>
              🔢 Escaneados: <Text style={styles.counterValue}>{totalScans}</Text>
            </Text>
            {lastFeedback && (
              <Animated.View
                style={[
                  styles.feedbackBadge,
                  {
                    backgroundColor: feedbackColor,
                    opacity: feedbackAnim,
                  },
                ]}
              >
                <Text style={styles.feedbackBadgeText}>
                  {lastFeedback === 'success'
                    ? '✓ Registrado'
                    : lastFeedback === 'duplicate'
                    ? '⚠ Duplicado'
                    : '⏳ Pendiente'}
                </Text>
              </Animated.View>
            )}
          </View>

          {/* Camera toggle button */}
          <View style={styles.cameraModeToggle}>
            <TouchableOpacity
              style={[
                styles.cameraToggleBtn,
                showWebCamera && styles.cameraToggleBtnActive,
              ]}
              onPress={() => setShowWebCamera(!showWebCamera)}
            >
              <Text style={styles.cameraToggleBtnText}>
                {showWebCamera ? '✕ Cerrar Cámara' : '📷 Abrir Cámara'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Web Camera Scanner */}
          {showWebCamera && (
            <View style={styles.webCameraContainer}>
              <WebCameraScanner
                onBarcodeScanned={(data) => processBarcode(data)}
                onClose={() => setShowWebCamera(false)}
              />
            </View>
          )}

          {/* Manual input area */}
          <View style={styles.webInputArea}>
            <Text style={styles.webInputLabel}>
              Ingresá o pegá el código de barras:
            </Text>
            <Text style={styles.webInputHint}>
              Podés usar un lector USB/Bluetooth — el código se enviará al presionar Enter.
            </Text>
            <View style={styles.webInputRow}>
              <TextInput
                ref={inputRef}
                style={[styles.webInput, isProcessing && styles.webInputDisabled]}
                value={manualInput}
                onChangeText={setManualInput}
                placeholder="Ej: 7790001000011"
                placeholderTextColor="#475569"
                onSubmitEditing={handleManualSubmit}
                editable={!isProcessing}
                autoFocus={!showWebCamera}
                returnKeyType="done"
                keyboardType="number-pad"
              />
              <TouchableOpacity
                style={[styles.scanBtn, isProcessing && styles.scanBtnDisabled]}
                onPress={handleManualSubmit}
                disabled={isProcessing}
              >
                <Text style={styles.scanBtnText}>
                  {isProcessing ? '...' : '➕ Registrar'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick-access barcodes from mock data */}
          <View style={styles.quickCodesArea}>
            <Text style={styles.listTitle}>Códigos de prueba (tap para escanear):</Text>
            <View style={styles.quickCodesGrid}>
              {MOCK_BARCODES.map((code) => (
                <TouchableOpacity
                  key={code}
                  style={styles.quickCodeChip}
                  onPress={() => processBarcode(code)}
                  disabled={isProcessing || scannedIdsRef.current.has(code)}
                >
                  <Text
                    style={[
                      styles.quickCodeText,
                      scannedIdsRef.current.has(code) && styles.quickCodeUsed,
                    ]}
                  >
                    {code}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Recent scans */}
          <View style={styles.listContainer}>
            <Text style={styles.listTitle}>Últimos Escaneos</Text>
            {recentScans.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📦</Text>
                <Text style={styles.emptyText}>
                  Ingresá un código de barras arriba para comenzar
                </Text>
              </View>
            ) : (
              <FlatList
                data={recentScans}
                keyExtractor={(item) => item.id_barra + item.scan_timestamp}
                renderItem={({ item }) => (
                  <View style={styles.scanItem}>
                    <View
                      style={[
                        styles.statusIndicator,
                        {
                          backgroundColor:
                            item.status === 'hydrated' ? '#22C55E' : '#F59E0B',
                        },
                      ]}
                    />
                    <View style={styles.scanItemContent}>
                      <Text style={styles.scanBarcode}>{item.id_barra}</Text>
                      <Text style={styles.scanDetail}>
                        {item.status === 'hydrated'
                          ? `${item.cod_articulo} · ${item.descripcion} · ${item.peso_nominal}kg · ${item.color}`
                          : '⚠️ Código no encontrado en maestro'}
                      </Text>
                    </View>
                  </View>
                )}
              />
            )}
          </View>

          {/* Action bar */}
          <View style={styles.actionBar}>
            <TouchableOpacity
              style={styles.reviewButton}
              onPress={handleGoToReview}
              activeOpacity={0.8}
            >
              <Text style={styles.reviewButtonText}>📋 Ver Resumen ({totalScans})</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── NATIVE MODE (camera) ─────────────────────────────────────────────────
  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionBox}>
          <Text style={styles.permissionTitle}>📷 Permiso de Cámara</Text>
          <Text style={styles.permissionText}>
            Se requiere acceso a la cámara para escanear códigos de barra.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Conceder Permiso</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Camera View - top half */}
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'qr'] }}
          onBarcodeScanned={handleBarcodeScanned}
        />
        {/* Scan overlay */}
        <View style={styles.scanOverlay}>
          <View style={styles.scanFrame} />
        </View>
        {/* Flash feedback overlay */}
        <Animated.View
          style={[
            styles.feedbackOverlay,
            {
              backgroundColor: feedbackColor,
              opacity: feedbackAnim,
            },
          ]}
        />
      </View>

      {/* Scan counter */}
      <View style={styles.counterBar}>
        <Text style={styles.counterText}>
          🔢 Escaneados: <Text style={styles.counterValue}>{totalScans}</Text>
        </Text>
        <Text style={styles.sessionLabel}>Sesión: {sessionId.substring(0, 12)}...</Text>
      </View>

      {/* Recent scans list - bottom half */}
      <View style={styles.listContainer}>
        <Text style={styles.listTitle}>Últimos Escaneos</Text>
        {recentScans.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyText}>Apunta la cámara a un código de barras</Text>
          </View>
        ) : (
          <FlatList
            data={recentScans}
            keyExtractor={(item) => item.id_barra + item.scan_timestamp}
            renderItem={({ item }) => (
              <View style={styles.scanItem}>
                <View
                  style={[
                    styles.statusIndicator,
                    {
                      backgroundColor:
                        item.status === 'hydrated' ? '#22C55E' : '#F59E0B',
                    },
                  ]}
                />
                <View style={styles.scanItemContent}>
                  <Text style={styles.scanBarcode}>{item.id_barra}</Text>
                  <Text style={styles.scanDetail}>
                    {item.status === 'hydrated'
                      ? `${item.cod_articulo} · ${item.descripcion} · ${item.peso_nominal}kg`
                      : 'Pendiente de datos maestros'}
                  </Text>
                </View>
              </View>
            )}
          />
        )}
      </View>

      {/* Action bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={styles.reviewButton}
          onPress={handleGoToReview}
          activeOpacity={0.8}
        >
          <Text style={styles.reviewButtonText}>📋 Ver Resumen ({totalScans})</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// Mock barcodes from textile mock data for quick testing on web
const MOCK_BARCODES = [
  '7790001000011', // ALG-BLA Algodón Blanco 12.5kg
  '7790001000028', // ALG-BLA Algodón Blanco 11.8kg
  '7790001000042', // ALG-NEG Algodón Negro 10.0kg
  '7790001000066', // ALG-ROJ Algodón Rojo 14.5kg
  '7790001000097', // POL-BLA Poliéster Blanco 8.5kg
  '7790001000127', // POL-NEG Poliéster Negro 7.5kg
  '7790001000158', // LIN-BLA Lino Blanco 6.5kg
  '7790001000172', // LIN-CRU Lino Crudo 6.8kg
  '7790001000219', // DEN-AZU Denim Azul 15.0kg
  '7790001000257', // GAB-BEI Gabardina Beige 10.5kg
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  // ── WEB STYLES ─────────────────────────────────────────────────────────────
  webHeader: {
    padding: 16,
    paddingTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  backBtn: {
    marginBottom: 8,
  },
  backBtnText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  webHeaderTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  webSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    marginBottom: 8,
  },
  cameraModeToggle: {
    padding: 16,
    paddingBottom: 0,
  },
  cameraToggleBtn: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  cameraToggleBtnActive: {
    backgroundColor: '#7F1D1D',
    borderColor: '#DC2626',
  },
  cameraToggleBtnText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  webCameraContainer: {
    padding: 16,
    paddingTop: 12,
  },
  webInputArea: {
    padding: 16,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  webInputLabel: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  webInputHint: {
    color: '#64748B',
    fontSize: 12,
    marginBottom: 12,
  },
  webInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  webInput: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#F8FAFC',
    fontSize: 16,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
    borderWidth: 1,
    borderColor: '#334155',
  },
  webInputDisabled: {
    opacity: 0.5,
  },
  scanBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanBtnDisabled: {
    opacity: 0.5,
  },
  scanBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  quickCodesArea: {
    padding: 16,
    paddingBottom: 8,
  },
  quickCodesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  quickCodeChip: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  quickCodeText: {
    color: '#94A3B8',
    fontSize: 11,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
  },
  quickCodeUsed: {
    color: '#334155',
    textDecorationLine: 'line-through',
  },
  feedbackBadge: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  feedbackBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  // ── NATIVE CAMERA STYLES ───────────────────────────────────────────────────
  cameraContainer: {
    height: '40%',
    position: 'relative',
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 250,
    height: 150,
    borderWidth: 2,
    borderColor: '#3B82F6',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  feedbackOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  // ── SHARED STYLES ──────────────────────────────────────────────────────────
  counterBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  counterText: {
    color: '#CBD5E1',
    fontSize: 15,
  },
  counterValue: {
    color: '#3B82F6',
    fontWeight: '700',
    fontSize: 18,
  },
  sessionLabel: {
    color: '#64748B',
    fontSize: 11,
  },
  listContainer: {
    flex: 1,
    padding: 16,
  },
  listTitle: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 15,
    textAlign: 'center',
  },
  scanItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
    flexShrink: 0,
  },
  scanItemContent: {
    flex: 1,
  },
  scanBarcode: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
  },
  scanDetail: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 3,
  },
  actionBar: {
    padding: 16,
    paddingBottom: 24,
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  reviewButton: {
    backgroundColor: '#8B5CF6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  reviewButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  permissionBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 12,
  },
  permissionText: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
