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
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { initializeDatabase } from '../db/database';
import { getMasterCount, getLastSyncTimestamp } from '../services/syncService';

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

export default function DashboardScreen({ navigation }: Props) {
  const [masterCount, setMasterCount] = useState<number>(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        await initializeDatabase();
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
    Alert.alert(
      'Sincronizar Maestro',
      '¿Estás seguro de que deseas forzar la sincronización del maestro de artículos?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sincronizar',
          onPress: () => {
            Alert.alert(
              'Información',
              'La sincronización desde Google Sheets será configurada en una próxima iteración. Por ahora, los datos se cargan vía CSV local.'
            );
          },
        },
      ]
    );
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
          <Text style={styles.headerTitle}>📦 Control Stock</Text>
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
          style={styles.secondaryButton}
          onPress={handleForceSync}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryButtonText}>⬇️  Forzar Sincronización de Maestro</Text>
        </TouchableOpacity>
      </ScrollView>
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
    borderColor: '#334155',
  },
  secondaryButtonText: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '600',
  },
});
