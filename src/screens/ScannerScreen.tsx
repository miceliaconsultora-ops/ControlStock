import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, ScanEvent, ScanEventStatus } from '../types';
import {
  getSessionValidScanCount,
  processScan,
} from '../services/scanWorkflowService';
import { getClientDeliveryCompletion } from '../services/aggregationService';
import {
  exportDeliveryClient,
  maybeAutoFinalizeDelivery,
} from '../services/exportService';
import WebCameraScanner from '../components/WebCameraScanner';

type CompletedClient = { cliente_id: string; cliente_nombre: string };

type Props = NativeStackScreenProps<RootStackParamList, 'Scanner'>;

const SAME_CODE_DEBOUNCE_MS = 900;

export default function ScannerScreen({ route, navigation }: Props) {
  const { sessionId, mode } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const [recentScans, setRecentScans] = useState<ScanEvent[]>([]);
  const [totalScans, setTotalScans] = useState(0);
  const [lastFeedback, setLastFeedback] = useState<ScanEventStatus | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showWebCamera, setShowWebCamera] = useState(false);
  const [completedClients, setCompletedClients] = useState<CompletedClient[]>([]);
  const [sendingClientId, setSendingClientId] = useState<string | null>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const sentClientIdsRef = useRef<Set<string>>(new Set());
  const feedbackAnim = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  const isWeb = Platform.OS === 'web';
  const isDelivery = mode === 'delivery';

  useEffect(() => {
    if (!isWeb && !permission?.granted) {
      requestPermission();
    }
  }, [permission, isWeb]);

  const flashFeedback = (status: ScanEventStatus) => {
    setLastFeedback(status);
    feedbackAnim.setValue(1);
    Animated.timing(feedbackAnim, {
      toValue: 0,
      duration: 1000,
      useNativeDriver: true,
    }).start(() => setLastFeedback(null));
  };

  const notifyDuplicate = (code: string) => {
    if (isWeb) alert(`Duplicado\nEl codigo ${code} ya fue escaneado en esta sesion.`);
    else Alert.alert('Duplicado', `El codigo ${code} ya fue escaneado en esta sesion.`);
  };

  const processBarcode = async (rawData: string, source: string) => {
    const code = rawData.trim();
    if (!code) return;

    const now = Date.now();
    if (
      lastScanRef.current.code === code &&
      now - lastScanRef.current.time < SAME_CODE_DEBOUNCE_MS
    ) {
      return;
    }
    lastScanRef.current = { code, time: now };

    setIsProcessing(true);
    try {
      const event = await processScan(mode, sessionId, code, source);
      setRecentScans((prev) => [event, ...prev].slice(0, 12));
      flashFeedback(event.status);

      if (!isWeb) {
        const feedbackType =
          event.status === 'hydrated' || event.status === 'delivered'
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Error;
        Haptics.notificationAsync(feedbackType);
      }

      if (event.status === 'duplicate_session') notifyDuplicate(code);

      const count = await getSessionValidScanCount(sessionId, mode);
      setTotalScans(count);

      if (isDelivery && event.status === 'delivered' && event.cliente_id) {
        const clienteId = event.cliente_id;
        const completion = await getClientDeliveryCompletion(sessionId, clienteId);
        if (completion.isComplete && !sentClientIdsRef.current.has(clienteId)) {
          const clienteNombre =
            event.cliente_nombre ?? completion.clienteNombre ?? 'Cliente';
          setCompletedClients((prev) =>
            prev.some((c) => c.cliente_id === clienteId)
              ? prev
              : [...prev, { cliente_id: clienteId, cliente_nombre: clienteNombre }]
          );
        }
      }
    } catch (err) {
      console.error('Scan error:', err);
      flashFeedback('error');
      if (!isWeb) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualSubmit = async () => {
    const code = manualInput.trim();
    if (!code) return;
    setManualInput('');
    await processBarcode(code, 'manual');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const finishLoad = (title: string, message: string) => {
    if (isWeb) {
      alert(`${title}\n${message}`);
      navigation.popToTop();
    } else {
      Alert.alert(title, message, [
        { text: 'OK', onPress: () => navigation.popToTop() },
      ]);
    }
  };

  const handleSendClient = async (cliente: CompletedClient) => {
    if (sendingClientId) return;
    setSendingClientId(cliente.cliente_id);
    try {
      const result = await exportDeliveryClient(sessionId, cliente.cliente_id);

      if (result !== 'uploaded') {
        // Upload failed: shared locally, keep the banner so it can be retried.
        const message =
          'No se pudo subir a Drive. Se guardo localmente. Toca de nuevo para reintentar.';
        if (isWeb) alert(`Sin conexion\n${message}`);
        else Alert.alert('Sin conexion', message);
        return;
      }

      sentClientIdsRef.current.add(cliente.cliente_id);
      setCompletedClients((prev) =>
        prev.filter((c) => c.cliente_id !== cliente.cliente_id)
      );

      const finalized = await maybeAutoFinalizeDelivery(sessionId);
      if (finalized) {
        finishLoad(
          'Carga finalizada',
          `Se envio ${cliente.cliente_nombre} y se cerro la carga. Esta planilla no podra reutilizarse.`
        );
        return;
      }

      if (isWeb) alert(`Cliente enviado\nJSON de ${cliente.cliente_nombre} enviado a Drive.`);
      else Alert.alert('Cliente enviado', `JSON de ${cliente.cliente_nombre} enviado a Drive.`);
    } catch (err: any) {
      const message = err?.message || String(err);
      if (isWeb) alert(`Error\n${message}`);
      else Alert.alert('Error', message);
    } finally {
      setSendingClientId(null);
    }
  };

  const feedbackColor = getFeedbackColor(lastFeedback);
  const title = isDelivery ? 'Entrega de preparado' : 'Preparacion de entrega';

  if (isWeb) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
          <View style={styles.webHeader}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Text style={styles.backBtnText}>Volver</Text>
            </TouchableOpacity>
            <Text style={styles.webHeaderTitle}>{title}</Text>
            <Text style={styles.webSubtitle}>
              {isDelivery
                ? 'Escanea rollos ya preparados. El cliente se toma del manifiesto.'
                : 'Escanea rollos contra el stock local sincronizado.'}
            </Text>
            <Text style={styles.sessionLabel}>ID: {sessionId.substring(0, 16)}...</Text>
          </View>

          <View style={styles.counterBar}>
            <Text style={styles.counterText}>
              Valid o registrados: <Text style={styles.counterValue}>{totalScans}</Text>
            </Text>
            {lastFeedback ? (
              <Animated.View
                style={[styles.feedbackBadge, { backgroundColor: feedbackColor, opacity: feedbackAnim }]}
              >
                <Text style={styles.feedbackBadgeText}>{getStatusLabel(lastFeedback)}</Text>
              </Animated.View>
            ) : null}
          </View>

          <CompletedClientBanners
            clients={completedClients}
            sendingId={sendingClientId}
            onSend={handleSendClient}
          />

          <View style={styles.cameraModeToggle}>
            <TouchableOpacity
              style={[styles.cameraToggleBtn, showWebCamera && styles.cameraToggleBtnActive]}
              onPress={() => setShowWebCamera(!showWebCamera)}
            >
              <Text style={styles.cameraToggleBtnText}>
                {showWebCamera ? 'Cerrar camara' : 'Abrir camara'}
              </Text>
            </TouchableOpacity>
          </View>

          {showWebCamera ? (
            <View style={styles.webCameraContainer}>
              <WebCameraScanner
                onBarcodeScanned={(data: string) => processBarcode(data, 'web_camera')}
                onClose={() => setShowWebCamera(false)}
              />
            </View>
          ) : null}

          <View style={styles.webInputArea}>
            <Text style={styles.webInputLabel}>Codigo de barras</Text>
            <Text style={styles.webInputHint}>
              Lector USB/Bluetooth, pegado manual o Enter desde el input.
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
              />
              <TouchableOpacity
                style={[styles.scanBtn, isProcessing && styles.scanBtnDisabled]}
                onPress={handleManualSubmit}
                disabled={isProcessing}
              >
                <Text style={styles.scanBtnText}>{isProcessing ? '...' : 'Registrar'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.quickCodesArea}>
            <Text style={styles.listTitle}>Codigos de prueba</Text>
            <View style={styles.quickCodesGrid}>
              {MOCK_BARCODES.map((code) => (
                <TouchableOpacity
                  key={code}
                  style={styles.quickCodeChip}
                  onPress={() => processBarcode(code, 'quick_test')}
                  disabled={isProcessing}
                >
                  <Text style={styles.quickCodeText}>{code}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <RecentScansList recentScans={recentScans} />

          <View style={styles.actionBar}>
            <TouchableOpacity
              style={styles.reviewButton}
              onPress={() => navigation.navigate('Review', { sessionId, mode })}
            >
              <Text style={styles.reviewButtonText}>Ver resumen ({totalScans})</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionBox}>
          <Text style={styles.permissionTitle}>Permiso de camara</Text>
          <Text style={styles.permissionText}>
            Se requiere acceso a la camara para escanear codigos.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Conceder permiso</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'qr'] }}
          onBarcodeScanned={({ data }) => processBarcode(data, 'native_camera')}
        />
        <View style={styles.scanOverlay}>
          <View style={styles.scanFrame} />
        </View>
        <Animated.View
          style={[styles.feedbackOverlay, { backgroundColor: feedbackColor, opacity: feedbackAnim }]}
        />
      </View>

      <View style={styles.counterBar}>
        <Text style={styles.counterText}>
          Registrados: <Text style={styles.counterValue}>{totalScans}</Text>
        </Text>
        <Text style={styles.sessionLabel}>{title}</Text>
      </View>

      <CompletedClientBanners
        clients={completedClients}
        sendingId={sendingClientId}
        onSend={handleSendClient}
      />

      <RecentScansList recentScans={recentScans} />

      <View style={styles.actionBar}>
        <TouchableOpacity
          style={styles.reviewButton}
          onPress={() => navigation.navigate('Review', { sessionId, mode })}
        >
          <Text style={styles.reviewButtonText}>Ver resumen ({totalScans})</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function CompletedClientBanners({
  clients,
  sendingId,
  onSend,
}: {
  clients: CompletedClient[];
  sendingId: string | null;
  onSend: (cliente: CompletedClient) => void;
}) {
  if (clients.length === 0) return null;
  return (
    <View style={styles.completeBanners}>
      {clients.map((cliente) => {
        const isSending = sendingId === cliente.cliente_id;
        return (
          <TouchableOpacity
            key={cliente.cliente_id}
            style={styles.completeBanner}
            onPress={() => onSend(cliente)}
            disabled={isSending}
            activeOpacity={0.85}
          >
            {isSending ? (
              <ActivityIndicator color="#052E16" />
            ) : (
              <>
                <Text style={styles.completeBannerTitle}>Cliente completo - Enviar</Text>
                <Text style={styles.completeBannerName}>{cliente.cliente_nombre}</Text>
              </>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function RecentScansList({ recentScans }: { recentScans: ScanEvent[] }) {
  return (
    <View style={styles.listContainer}>
      <Text style={styles.listTitle}>Ultimos escaneos</Text>
      {recentScans.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Escanea un codigo para comenzar</Text>
        </View>
      ) : (
        <FlatList
          data={recentScans}
          keyExtractor={(item) => item.event_id}
          renderItem={({ item }) => (
            <View style={styles.scanItem}>
              <View
                style={[
                  styles.statusIndicator,
                  { backgroundColor: getFeedbackColor(item.status) },
                ]}
              />
              <View style={styles.scanItemContent}>
                <Text style={styles.scanBarcode}>{item.id_barra}</Text>
                <Text style={styles.scanDetail}>{getScanDetail(item)}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

function getFeedbackColor(status: ScanEventStatus | null): string {
  if (status === 'hydrated' || status === 'delivered') return '#22C55E';
  if (status === 'pending') return '#F59E0B';
  if (status === 'duplicate_session') return '#EF4444';
  if (
    status === 'not_prepared' ||
    status === 'wrong_client' ||
    status === 'error'
  ) {
    return '#DC2626';
  }
  return 'transparent';
}

function getStatusLabel(status: ScanEventStatus): string {
  switch (status) {
    case 'hydrated':
      return 'Preparado';
    case 'delivered':
      return 'Entregado';
    case 'pending':
      return 'Pendiente maestro';
    case 'not_prepared':
      return 'No preparado';
    case 'wrong_client':
      return 'Cliente incorrecto';
    case 'duplicate_session':
      return 'Duplicado';
    default:
      return 'Error';
  }
}

function getScanDetail(item: ScanEvent): string {
  if (item.status === 'delivered') {
    return `${item.cliente_nombre ?? 'Cliente'} | ${item.cod_articulo ?? ''} | ${item.peso_nominal ?? 0}kg`;
  }
  if (item.status === 'hydrated') {
    return `${item.cod_articulo ?? ''} | ${item.descripcion ?? ''} | ${item.peso_nominal ?? 0}kg | ${item.color ?? ''}`;
  }
  if (item.status === 'pending') return 'No encontrado en stock, queda pendiente';
  if (item.status === 'not_prepared') return 'No esta en el preparado pendiente';
  if (item.status === 'wrong_client') return 'Pertenece a otro cliente';
  if (item.status === 'duplicate_session') return 'Ya escaneado en esta sesion';
  return 'Error de lectura';
}

const MOCK_BARCODES = [
  '7790001000011',
  '7790001000028',
  '7790001000042',
  '7790001000066',
  '7790001000097',
  '7790001000127',
  '7790001000158',
  '7790001000172',
  '7790001000219',
  '7790001000257',
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
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
    fontWeight: '700',
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
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  cameraToggleBtnActive: {
    backgroundColor: '#7F1D1D',
    borderColor: '#DC2626',
  },
  cameraToggleBtnText: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
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
    fontWeight: '800',
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
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanBtnDisabled: {
    opacity: 0.5,
  },
  scanBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
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
  completeBanners: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  completeBanner: {
    backgroundColor: '#22C55E',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
    shadowColor: '#22C55E',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  completeBannerTitle: {
    color: '#052E16',
    fontSize: 17,
    fontWeight: '900',
  },
  completeBannerName: {
    color: '#064E3B',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  cameraContainer: {
    height: '42%',
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
  },
  feedbackOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
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
    fontSize: 14,
  },
  counterValue: {
    color: '#3B82F6',
    fontWeight: '800',
    fontSize: 18,
  },
  sessionLabel: {
    color: '#64748B',
    fontSize: 11,
  },
  feedbackBadge: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  feedbackBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  listContainer: {
    flex: 1,
    padding: 16,
  },
  listTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 140,
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
    borderRadius: 10,
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
  },
  scanItemContent: {
    flex: 1,
  },
  scanBarcode: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
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
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  reviewButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  permissionBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: '800',
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
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
