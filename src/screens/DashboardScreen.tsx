import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { initializeDatabase } from '../db/database';
import {
  getLastSyncTimestamp,
  getMasterCount,
  syncFromCloud,
  syncFromCsvText,
} from '../services/syncService';
import { getOperatorName, setOperatorName } from '../services/operatorService';
import { MOCK_ARTICLES_CSV } from '../constants/mockData';
import { MOCK_DELIVERY_PLAN_CSV } from '../constants/mockDeliveryPlan';
import {
  getDeliveryPlanStats,
  syncDeliveryPlanFromCloud,
  syncDeliveryPlanFromCsvText,
} from '../services/deliveryPlanService';
import { countPendingExports, createSession } from '../services/sessionService';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

type DeliveryStats = {
  totalItems: number;
  totalClients: number;
  lastSync: string | null;
  manifestId: string | null;
  manifestVersion: string | null;
  isConsumed: boolean;
  consumedAt: string | null;
  consumedLoadId: string | null;
};

const EMPTY_DELIVERY_STATS: DeliveryStats = {
  totalItems: 0,
  totalClients: 0,
  lastSync: null,
  manifestId: null,
  manifestVersion: null,
  isConsumed: false,
  consumedAt: null,
  consumedLoadId: null,
};

export default function DashboardScreen({ navigation }: Props) {
  const [masterCount, setMasterCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [deliveryStats, setDeliveryStats] = useState<DeliveryStats>(EMPTY_DELIVERY_STATS);
  const [pendingExports, setPendingExports] = useState(0);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncLabel, setSyncLabel] = useState('');
  const [syncProgress, setSyncProgress] = useState(0);

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
          setTempOperatorName(name);
        } else {
          setShowOperatorModal(true);
        }
        await loadStats();
      } catch (err) {
        console.error('DB init error:', err);
      } finally {
        setIsInitializing(false);
      }
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!isInitializing) loadStats();
    }, [isInitializing])
  );

  const loadStats = async () => {
    const [count, sync, delivery, exportsCount] = await Promise.all([
      getMasterCount(),
      getLastSyncTimestamp(),
      getDeliveryPlanStats(),
      countPendingExports(),
    ]);
    setMasterCount(count);
    setLastSync(sync);
    setDeliveryStats(delivery);
    setPendingExports(exportsCount);
  };

  const notify = (title: string, message: string) => {
    if (Platform.OS === 'web') alert(`${title}\n${message}`);
    else Alert.alert(title, message);
  };

  const runStockMockSync = async () => {
    setIsSyncing(true);
    setSyncLabel('Cargando stock de prueba...');
    setSyncProgress(0);
    try {
      const count = await syncFromCsvText(MOCK_ARTICLES_CSV, setSyncProgress);
      await loadStats();
      notify('Stock cargado', `Se cargaron ${count} articulos de prueba.`);
    } catch (err: any) {
      notify('Error', err?.message || String(err));
    } finally {
      setIsSyncing(false);
      setSyncLabel('');
      setSyncProgress(0);
    }
  };

  const runStockCloudSync = async () => {
    setIsSyncing(true);
    setSyncLabel('Actualizando stock desde Drive...');
    setSyncProgress(0);
    try {
      const count = await syncFromCloud(setSyncProgress);
      await loadStats();
      notify('Stock actualizado', count > 0 ? `${count} articulos descargados.` : 'Ya estaba al dia.');
    } catch (err: any) {
      notify('Error de conexion', err?.message || String(err));
    } finally {
      setIsSyncing(false);
      setSyncLabel('');
      setSyncProgress(0);
    }
  };

  const runDeliveryMockSync = async () => {
    setIsSyncing(true);
    setSyncLabel('Cargando preparado pendiente...');
    setSyncProgress(0);
    try {
      const count = await syncDeliveryPlanFromCsvText(
        MOCK_DELIVERY_PLAN_CSV,
        setSyncProgress
      );
      await loadStats();
      notify('Preparado cargado', `Se cargaron ${count} rollos preparados.`);
    } catch (err: any) {
      notify('Error', err?.message || String(err));
    } finally {
      setIsSyncing(false);
      setSyncLabel('');
      setSyncProgress(0);
    }
  };

  const runDeliveryCloudSync = async () => {
    setIsSyncing(true);
    setSyncLabel('Actualizando preparado desde Drive...');
    setSyncProgress(0);
    try {
      const count = await syncDeliveryPlanFromCloud(setSyncProgress);
      await loadStats();
      notify(
        'Preparado actualizado',
        count > 0 ? `${count} rollos preparados descargados.` : 'Ya estaba al dia.'
      );
    } catch (err: any) {
      notify('Error de conexion', err?.message || String(err));
    } finally {
      setIsSyncing(false);
      setSyncLabel('');
      setSyncProgress(0);
    }
  };

  const startPreparation = async () => {
    const session = await createSession('preparation');
    navigation.navigate('Scanner', {
      sessionId: session.session_id,
      mode: 'preparation',
    });
  };

  const startDelivery = async () => {
    if (deliveryStats.totalItems === 0) {
      notify('Falta preparado', 'Primero carga o sincroniza el preparado pendiente.');
      return;
    }

    if (deliveryStats.isConsumed) {
      notify(
        'Preparado ya utilizado',
        'Esta planilla ya genero una entrega. Actualiza el preparado desde Drive antes de volver a entregar.'
      );
      return;
    }

    const session = await createSession('delivery', {
      manifestId: deliveryStats.manifestId,
      manifestVersion: deliveryStats.manifestVersion,
    });
    navigation.navigate('Scanner', {
      sessionId: session.session_id,
      mode: 'delivery',
    });
  };

  const handleSaveOperatorName = async () => {
    const name = tempOperatorName.trim();
    if (!name) {
      notify('Atencion', 'Ingresa tu nombre para continuar.');
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
        <Text style={styles.loadingText}>Inicializando base local...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.headerTitle}>Control Stock V2</Text>
            {operatorName ? (
              <TouchableOpacity onPress={() => setShowOperatorModal(true)}>
                <Text style={styles.operatorBadge}>{operatorName}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={styles.headerSubtitle}>Preparacion y entrega de rollos</Text>
        </View>

        <View style={styles.cardsRow}>
          <View style={styles.card}>
            <Text style={styles.cardValue}>{masterCount.toLocaleString()}</Text>
            <Text style={styles.cardLabel}>Stock local</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardValue}>{deliveryStats.totalItems}</Text>
            <Text style={styles.cardLabel}>Preparado pendiente</Text>
          </View>
        </View>

        <View style={styles.cardsRow}>
          <View style={styles.card}>
            <Text style={styles.cardValue}>{deliveryStats.totalClients}</Text>
            <Text style={styles.cardLabel}>Clientes en entrega</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardValue}>{pendingExports}</Text>
            <Text style={styles.cardLabel}>Exports pendientes</Text>
          </View>
        </View>

        <View style={styles.statusBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>
            Stock: {lastSync ? new Date(lastSync).toLocaleDateString('es-AR') : 'sin sync'}
            {'  '}| Preparado:{' '}
            {deliveryStats.lastSync
              ? new Date(deliveryStats.lastSync).toLocaleDateString('es-AR')
              : 'sin sync'}
          </Text>
        </View>

        {deliveryStats.isConsumed ? (
          <View style={styles.consumedWarning}>
            <Text style={styles.consumedTitle}>Preparado ya utilizado</Text>
            <Text style={styles.consumedText}>
              Carga: {deliveryStats.consumedLoadId || '-'} |{' '}
              {deliveryStats.consumedAt
                ? new Date(deliveryStats.consumedAt).toLocaleString('es-AR')
                : 'sin fecha'}
            </Text>
            <Text style={styles.consumedText}>
              Actualiza el preparado desde Drive para traer la planilla restante.
            </Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.primaryButton} onPress={startPreparation}>
          <Text style={styles.primaryButtonText}>Preparar entrega</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.deliveryButton,
            deliveryStats.isConsumed && styles.buttonDisabled,
          ]}
          onPress={startDelivery}
          disabled={deliveryStats.isConsumed}
        >
          <Text style={styles.primaryButtonText}>Entregar preparado</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={runStockCloudSync}
          disabled={isSyncing}
        >
          <Text style={styles.secondaryButtonText}>Actualizar stock desde Drive</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={runDeliveryMockSync}
          disabled={isSyncing}
        >
          <Text style={styles.secondaryButtonText}>Cargar preparado de prueba</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={runDeliveryCloudSync}
          disabled={isSyncing}
        >
          <Text style={styles.secondaryButtonText}>Actualizar preparado desde Drive</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.tertiaryButton}
          onPress={runStockMockSync}
          disabled={isSyncing}
        >
          <Text style={styles.tertiaryButtonText}>Reiniciar stock de prueba</Text>
        </TouchableOpacity>
      </ScrollView>

      {isSyncing ? (
        <View style={styles.syncOverlay}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.syncText}>{syncLabel}</Text>
          <Text style={styles.syncPercent}>{syncProgress}%</Text>
        </View>
      ) : null}

      <Modal visible={showOperatorModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Operario</Text>
            <Text style={styles.modalSubtitle}>
              Nombre que se adjunta a las preparaciones y entregas.
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ej: Juan Perez"
              placeholderTextColor="#64748B"
              value={tempOperatorName}
              onChangeText={setTempOperatorName}
              autoCapitalize="words"
              autoFocus
            />
            <TouchableOpacity style={styles.modalButton} onPress={handleSaveOperatorName}>
              <Text style={styles.modalButtonText}>Guardar</Text>
            </TouchableOpacity>
            {operatorName ? (
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowOperatorModal(false)}
              >
                <Text style={styles.modalCancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
            ) : null}
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
    marginBottom: 26,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  headerSubtitle: {
    fontSize: 15,
    color: '#94A3B8',
    marginTop: 4,
  },
  operatorBadge: {
    backgroundColor: '#172554',
    color: '#93C5FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    fontSize: 13,
    fontWeight: '700',
    overflow: 'hidden',
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  card: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  cardLabel: {
    color: '#94A3B8',
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadge: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 22,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginRight: 8,
  },
  statusText: {
    color: '#CBD5E1',
    fontSize: 12,
    flex: 1,
  },
  consumedWarning: {
    backgroundColor: '#451A03',
    borderColor: '#B45309',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  consumedTitle: {
    color: '#FCD34D',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  consumedText: {
    color: '#FED7AA',
    fontSize: 12,
    lineHeight: 17,
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 12,
  },
  deliveryButton: {
    backgroundColor: '#16A34A',
    borderRadius: 12,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 18,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#475569',
    marginBottom: 10,
  },
  secondaryButtonText: {
    color: '#CBD5E1',
    fontSize: 15,
    fontWeight: '700',
  },
  tertiaryButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  tertiaryButtonText: {
    color: '#64748B',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  syncOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.86)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  syncText: {
    color: '#F8FAFC',
    marginTop: 16,
    fontSize: 16,
    fontWeight: '700',
  },
  syncPercent: {
    color: '#93C5FD',
    marginTop: 6,
    fontSize: 14,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  modalSubtitle: {
    color: '#94A3B8',
    fontSize: 14,
    marginBottom: 18,
  },
  modalInput: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 14,
    color: '#F8FAFC',
    fontSize: 16,
    marginBottom: 16,
  },
  modalButton: {
    backgroundColor: '#2563EB',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  modalCancelButton: {
    marginTop: 12,
    padding: 8,
    alignItems: 'center',
  },
  modalCancelButtonText: {
    color: '#94A3B8',
  },
});
