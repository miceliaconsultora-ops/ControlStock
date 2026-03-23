import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList, AggregatedArticle } from '../types';
import { getAggregatedData, getSessionTotals } from '../services/aggregationService';
import { exportAndShare, purgeSession } from '../services/exportService';

type Props = NativeStackScreenProps<RootStackParamList, 'Review'>;

export default function ReviewScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;
  const [aggregated, setAggregated] = useState<AggregatedArticle[]>([]);
  const [totals, setTotals] = useState({ totalUnits: 0, totalWeight: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [data, sessionTotals] = await Promise.all([
        getAggregatedData(sessionId),
        getSessionTotals(sessionId),
      ]);
      setAggregated(data);
      setTotals(sessionTotals);
    } catch (err) {
      console.error('Error loading review data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinalize = () => {
    console.log('[Review] handleFinalize called. totalUnits:', totals.totalUnits);
    
    if (totals.totalUnits === 0) {
      if (Platform.OS === 'web') {
        alert('No hay escaneos en esta sesión para exportar.');
      } else {
        Alert.alert('Sin Datos', 'No hay escaneos en esta sesión para exportar.');
      }
      return;
    }

    if (Platform.OS === 'web') {
      // On web, run export directly — window.confirm can be unreliable
      console.log('[Review] Web mode — exporting directly...');
      performExport();
    } else {
      const message = `¿Confirmas el envío del lote?\n\n• ${totals.totalUnits} rollos\n• ${totals.totalWeight.toFixed(2)} kg total\n• ${aggregated.length} artículos distintos`;
      Alert.alert(
        'Finalizar Sesión',
        message,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Exportar y Enviar',
            style: 'destructive',
            onPress: performExport,
          },
        ]
      );
    }
  };

  const performExport = async () => {
    try {
      setIsExporting(true);
      console.log('[Review] performExport starting for session:', sessionId);
      
      const { getOperatorName } = await import('../services/operatorService');
      const opName = await getOperatorName() || 'Desconocido';
      
      const success = await exportAndShare(sessionId, 'DEVICE_001', opName);
      console.log('[Review] exportAndShare returned:', success);
      if (success) {
        console.log('[Review] Purging session...');
        await purgeSession(sessionId);
        console.log('[Review] Session purged. Navigating back...');

        if (Platform.OS === 'web') {
          // Don't use alert() here — it can block. Just navigate.
          navigation.popToTop();
        } else {
          Alert.alert('✅ Éxito', 'El lote fue exportado correctamente. La sesión ha sido limpiada.', [
            { text: 'Volver al Inicio', onPress: () => navigation.popToTop() },
          ]);
        }
      }
    } catch (err: any) {
      console.error('[Review] Export error:', err);
      const msg = 'La sesión NO fue eliminada. Podés intentar nuevamente.';
      if (Platform.OS === 'web') {
        alert(`Exportación Cancelada: ${msg}\n\nError: ${err?.message || err}`);
      } else {
        Alert.alert('Exportación Cancelada', msg);
      }
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={styles.loadingText}>Cargando resumen...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Totals Header */}
      <View style={styles.totalsHeader}>
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Rollos</Text>
          <Text style={styles.totalValue}>{totals.totalUnits}</Text>
        </View>
        <View style={styles.totalDivider} />
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Peso Total</Text>
          <Text style={styles.totalValue}>{totals.totalWeight.toFixed(2)} kg</Text>
        </View>
      </View>

      {/* Session Info */}
      <View style={styles.sessionInfo}>
        <Text style={styles.sessionLabel}>
          SESIÓN: {sessionId.substring(0, 12)}...
        </Text>
        <Text style={styles.articleCount}>
          {aggregated.length} artículo{aggregated.length !== 1 ? 's' : ''} distintos
        </Text>
      </View>

      {/* Aggregated List — grouped by cod_articulo (tela + color) */}
      <FlatList
        data={aggregated}
        keyExtractor={(item) => item.cod_articulo}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.articleCard}>
            <View style={styles.articleHeader}>
              <Text style={styles.articleCode}>{item.cod_articulo}</Text>
              <View style={styles.colorTag}>
                <Text style={styles.colorTagText}>{item.color}</Text>
              </View>
            </View>
            <Text style={styles.articleDesc} numberOfLines={1}>
              {item.descripcion} — {item.color}
            </Text>
            <View style={styles.articleStats}>
              <View style={styles.statPill}>
                <Text style={styles.statLabel}>Rollos</Text>
                <Text style={styles.statValue}>{item.total_units}</Text>
              </View>
              <View style={[styles.statPill, styles.statPillHighlight]}>
                <Text style={styles.statLabel}>Kg Total</Text>
                <Text style={styles.statValueBig}>{item.total_weight.toFixed(2)}</Text>
              </View>
            </View>
          </View>
        )}
      />

      {/* Action Bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.finalizeButton, isExporting && styles.buttonDisabled]}
          onPress={handleFinalize}
          disabled={isExporting}
          activeOpacity={0.8}
        >
          {isExporting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.finalizeButtonText}>📤 Finalizar y Exportar Lote (JSON)</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#94A3B8',
    marginTop: 12,
    fontSize: 15,
  },
  totalsHeader: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    margin: 16,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  totalCard: {
    flex: 1,
    alignItems: 'center',
  },
  totalDivider: {
    width: 1,
    backgroundColor: '#334155',
    marginVertical: 4,
  },
  totalLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  totalValue: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '800',
  },
  sessionInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sessionLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  articleCount: {
    color: '#8B5CF6',
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  articleCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  articleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  articleCode: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
  },
  colorTag: {
    backgroundColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  colorTagText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  articleDesc: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 12,
  },
  articleStats: {
    flexDirection: 'row',
    gap: 10,
  },
  statPill: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  statPillHighlight: {
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  statLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statValue: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  statValueBig: {
    color: '#3B82F6',
    fontSize: 18,
    fontWeight: '800',
  },
  actionBar: {
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  finalizeButton: {
    backgroundColor: '#22C55E',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  finalizeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
