import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  StatusBar,
  SafeAreaView,
  Platform,
  Modal,
  TextInput,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { initializeDatabase } from '../db/database';
import { getMasterCount, getLastSyncTimestamp, syncFromCsvText, checkCloudUpdate, syncFromCloud } from '../services/syncService';
import { getOperatorName, setOperatorName } from '../services/operatorService';
import { MOCK_ARTICLES_CSV } from '../constants/mockData';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

export default function DashboardScreen({ navigation }: Props) {
  const [masterCount, setMasterCount] = useState<number>(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);

  // Operator State
  const [operatorName, setOperatorNameState] = useState<string | null>(null);
  const [tempOperatorName, setTempOperatorName] = useState('');
  const [showOperatorModal, setShowOperatorModal] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await initializeDatabase();
        const name = await getOperatorName();
        if (name) {
          setOperatorNameState(name);
        } else {
          setShowOperatorModal(true);
        }
      } catch (err) {
        console.error('DB init error:', err);
      } finally {
        setIsInitializing(false);
      }
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!isInitializing) {
        loadStats();
      }
    }, [isInitializing])
  );

  const loadStats = async () => {
    try {
      const count = await getMasterCount();
      const sync = await getLastSyncTimestamp();
      setMasterCount(count);
      setLastSync(sync);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const handleNewSession = () => {
    const sessionId = `ses_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    navigation.navigate('Scanner', { sessionId });
  };

  const handleForceSync = () => {
    console.log('[Dashboard] handleForceSync called. Platform:', Platform.OS, 'masterCount:', masterCount);
    
    if (Platform.OS === 'web') {
      // On web, run sync directly — window.confirm can be unreliable
      console.log('[Dashboard] Web mode — running sync directly...');
      runSync();
    } else {
      const title = 'Cargar Datos de Prueba';
      const message = masterCount > 0
        ? `Ya hay ${masterCount} artículos. ¿Deseás recargar los datos de prueba?`
        : '¿Cargar los 25 artículos de prueba en la base de datos?';
      Alert.alert(title, message, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cargar ahora', onPress: runSync },
      ]);
    }
  };

  const runSync = async () => {
    setIsSyncing(true);
    setSyncProgress(0);
    try {
      console.log('Starting sync from embedded CSV...');
      // Use embedded CSV string — works on web and native without any fetch/require
      const count = await syncFromCsvText(MOCK_ARTICLES_CSV, (pct) => {
        setSyncProgress(pct);
        console.log(`Sync progress: ${pct}%`);
      });
      await loadStats();
      console.log(`Sync complete. Total articles: ${count}`);
      
      if (Platform.OS === 'web') {
        alert(`✅ ¡Listo! Se cargaron ${count} artículos de prueba.`);
      } else {
        Alert.alert('✅ ¡Listo!', `Se cargaron ${count} artículos de prueba.`);
      }
    } catch (err: any) {
      console.error('Sync error:', err);
      const errorMsg = `No se pudo cargar los datos.\n${err?.message ?? ''}`;
      if (Platform.OS === 'web') {
        alert(`❌ Error: ${errorMsg}`);
      } else {
        Alert.alert('Error', errorMsg);
      }
    } finally {
      setIsSyncing(false);
      setSyncProgress(0);
    }
  };

  const handleCloudSync = async () => {
    setIsSyncing(true);
    setSyncProgress(0);
    try {
      console.log('Verificando actualizaciones en la nube...');
      const updateInfo = await checkCloudUpdate();
      
      if (!updateInfo.hasUpdate) {
        if (Platform.OS === 'web') alert('El catálogo ya está en su última versión.');
        else Alert.alert('Catálogo Actualizado', 'Ya tienes la última versión instalada.');
        setIsSyncing(false);
        return;
      }
      
      console.log('Descargando nueva versión...');
      const count = await syncFromCloud((pct) => {
        setSyncProgress(pct);
        console.log(`Cloud Sync progress: ${pct}%`);
      });
      
      await loadStats();
      if (Platform.OS === 'web') alert(`¡Actualizado! Se descargaron ${count} artículos desde Google Drive.`);
      else Alert.alert('✅ ¡Actualizado!', `Se descargaron ${count} artículos desde Google Drive.`);
      
    } catch (err: any) {
      console.error('Cloud Sync error:', err);
      const errorMsg = `No se pudo conectar con la nube.\n${err?.message ?? ''}`;
      if (Platform.OS === 'web') alert(`❌ Error: ${errorMsg}`);
      else Alert.alert('Error de Conexión', errorMsg);
    } finally {
      setIsSyncing(false);
      setSyncProgress(0);
    }
  };

  const handleSaveOperatorName = async () => {
    const name = tempOperatorName.trim();
    if (!name) {
      Alert.alert('Atención', 'Por favor, ingrese su nombre para continuar.');
      return;
    }
    await setOperatorName(name);
    setOperatorNameState(name);
    setShowOperatorModal(false);
  };





  if (isInitializing) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Inicializando Base de Datos...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.headerTitle}>📦 Control Stock</Text>
            {operatorName && (
              <TouchableOpacity onPress={() => setShowOperatorModal(true)}>
                <Text style={styles.operatorBadge}>👤 {operatorName}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.headerSubtitle}>Sistema Industrial de Inventario</Text>
        </View>

        {/* Status Cards */}
        <View style={styles.cardsRow}>
          <View style={styles.card}>
            <Text style={styles.cardIcon}>🗄️</Text>
            <Text style={styles.cardValue}>{masterCount.toLocaleString()}</Text>
            <Text style={styles.cardLabel}>Artículos en DB</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardIcon}>🔄</Text>
            <Text style={styles.cardValue}>
              {lastSync
                ? new Date(lastSync).toLocaleDateString('es-AR')
                : 'Nunca'}
            </Text>
            <Text style={styles.cardLabel}>Última Sincronización</Text>
          </View>
        </View>

        {/* Connection Status */}
        <View style={styles.statusBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Modo Offline Activo</Text>
        </View>

        {/* Action Buttons */}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleNewSession}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonIcon}>📷</Text>
          <Text style={styles.primaryButtonText}>Nueva Sesión de Escaneo</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, { marginBottom: 12 }]}
          onPress={handleCloudSync}
          activeOpacity={0.8}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color="#94A3B8" />
          ) : (
            <Text style={styles.secondaryButtonText}>☁️ Actualizar Catálogo (Google Drive)</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tertiaryButton}
          onPress={handleForceSync}
          activeOpacity={0.8}
          disabled={isSyncing}
        >
          <Text style={styles.tertiaryButtonText}>Reiniciar con Datos de Prueba</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Sync Overlay */}
      {isSyncing && (
        <View style={styles.syncOverlay}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.syncText}>Sincronizando artículos de prueba...</Text>
        </View>
      )}

      {/* Operator Onboarding Modal */}
      <Modal
        visible={showOperatorModal}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalIcon}>👷</Text>
            <Text style={styles.modalTitle}>Bienvenido</Text>
            <Text style={styles.modalSubtitle}>
              Por favor, ingresa tu nombre y apellido para identificar tus escaneos.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ej: Juan Pérez"
              placeholderTextColor="#64748B"
              value={tempOperatorName}
              onChangeText={setTempOperatorName}
              autoCapitalize="words"
              autoFocus
            />
            <TouchableOpacity style={styles.modalButton} onPress={handleSaveOperatorName}>
              <Text style={styles.modalButtonText}>Guardar Identidad</Text>
            </TouchableOpacity>
            {operatorName && (
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setShowOperatorModal(false)}>
                <Text style={styles.modalCancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>

  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    marginBottom: 32,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#64748B',
    marginTop: 4,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  card: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  cardValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  cardLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#334155',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginRight: 8,
  },
  statusText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500',
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryButtonIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  secondaryButtonText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: '700',
  },
  tertiaryButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  tertiaryButtonText: {
    color: '#64748B',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  syncOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  syncText: {
    color: '#F8FAFC',
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  operatorBadge: {
    backgroundColor: '#3B82F620',
    color: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    fontSize: 14,
    fontWeight: '700',
    overflow: 'hidden',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  modalInput: {
    width: '100%',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 16,
    color: '#F8FAFC',
    fontSize: 16,
    marginBottom: 24,
  },
  modalButton: {
    backgroundColor: '#3B82F6',
    width: '100%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalCancelButton: {
    marginTop: 16,
    padding: 8,
  },
  modalCancelButtonText: {
    color: '#94A3B8',
    fontSize: 15,
  },
});
