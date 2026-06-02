import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import {
  AggregatedArticle,
  AggregatedDeliveryClient,
  RootStackParamList,
} from '../types';
import {
  getAggregatedData,
  getDeliveryAggregatedClients,
  getSessionTotalsByMode,
} from '../services/aggregationService';
import { exportAndShare } from '../services/exportService';

type Props = NativeStackScreenProps<RootStackParamList, 'Review'>;

export default function ReviewScreen({ route, navigation }: Props) {
  const { sessionId, mode } = route.params;
  const [articles, setArticles] = useState<AggregatedArticle[]>([]);
  const [clients, setClients] = useState<AggregatedDeliveryClient[]>([]);
  const [totals, setTotals] = useState({ totalUnits: 0, totalWeight: 0, exceptions: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const isDelivery = mode === 'delivery';

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [sessionId, mode])
  );

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [summaryTotals, prepData, deliveryData] = await Promise.all([
        getSessionTotalsByMode(sessionId, mode),
        isDelivery ? Promise.resolve([]) : getAggregatedData(sessionId),
        isDelivery ? getDeliveryAggregatedClients(sessionId) : Promise.resolve([]),
      ]);
      setTotals(summaryTotals);
      setArticles(prepData);
      setClients(deliveryData);
    } catch (err) {
      console.error('Error loading review data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const notify = (title: string, message: string) => {
    if (Platform.OS === 'web') alert(`${title}\n${message}`);
    else Alert.alert(title, message);
  };

  const handleFinalize = () => {
    if (totals.totalUnits === 0) {
      notify('Sin datos', 'No hay escaneos validos para exportar.');
      return;
    }

    if (Platform.OS === 'web') {
      performExport();
      return;
    }

    const detail = isDelivery
      ? `${totals.totalUnits} rollos entregados en ${clients.length} cliente(s).`
      : `${totals.totalUnits} rollos preparados en ${articles.length} grupo(s).`;

    Alert.alert('Finalizar sesion', detail, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Exportar', style: 'destructive', onPress: performExport },
    ]);
  };

  const performExport = async () => {
    try {
      setIsExporting(true);
      await exportAndShare(sessionId, undefined, undefined, mode);
      navigation.popToTop();
    } catch (err: any) {
      notify(
        'Exportacion cancelada',
        `La sesion queda guardada localmente. Error: ${err?.message || err}`
      );
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Cargando resumen...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.totalsHeader}>
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Rollos</Text>
          <Text style={styles.totalValue}>{totals.totalUnits}</Text>
        </View>
        <View style={styles.totalDivider} />
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Peso</Text>
          <Text style={styles.totalValue}>{totals.totalWeight.toFixed(2)} kg</Text>
        </View>
      </View>

      <View style={styles.sessionInfo}>
        <Text style={styles.sessionLabel}>
          {isDelivery ? 'ENTREGA' : 'PREPARACION'}: {sessionId.substring(0, 16)}...
        </Text>
        <Text style={styles.articleCount}>
          {isDelivery ? `${clients.length} clientes` : `${articles.length} grupos`}
        </Text>
      </View>

      {totals.exceptions > 0 ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            Hay {totals.exceptions} lectura(s) con alerta. No se exportan como validas.
          </Text>
        </View>
      ) : null}

      {isDelivery ? (
        <FlatList
          data={clients}
          keyExtractor={(item) => item.cliente_id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <DeliveryClientCard item={item} />}
        />
      ) : (
        <FlatList
          data={articles}
          keyExtractor={(item) => `${item.cod_articulo}-${item.color}`}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => <PreparationArticleCard item={item} />}
        />
      )}

      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.finalizeButton, isExporting && styles.buttonDisabled]}
          onPress={handleFinalize}
          disabled={isExporting}
        >
          {isExporting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.finalizeButtonText}>
              {isDelivery ? 'Exportar entrega por cliente' : 'Exportar preparacion'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function PreparationArticleCard({ item }: { item: AggregatedArticle }) {
  return (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemCode}>{item.cod_articulo}</Text>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{item.color}</Text>
        </View>
      </View>
      <Text style={styles.itemDesc} numberOfLines={1}>
        {item.descripcion}
      </Text>
      <StatsRow units={item.total_units} weight={item.total_weight} />
    </View>
  );
}

function DeliveryClientCard({ item }: { item: AggregatedDeliveryClient }) {
  return (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemCode}>{item.cliente_nombre}</Text>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{item.cliente_id}</Text>
        </View>
      </View>
      <Text style={styles.itemDesc}>JSON separado para este cliente al exportar</Text>
      <StatsRow units={item.total_units} weight={item.total_weight} />
    </View>
  );
}

function StatsRow({ units, weight }: { units: number; weight: number }) {
  return (
    <View style={styles.itemStats}>
      <View style={styles.statPill}>
        <Text style={styles.statLabel}>Rollos</Text>
        <Text style={styles.statValue}>{units}</Text>
      </View>
      <View style={[styles.statPill, styles.statPillHighlight]}>
        <Text style={styles.statLabel}>Kg</Text>
        <Text style={styles.statValueBig}>{weight.toFixed(2)}</Text>
      </View>
    </View>
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
    borderRadius: 12,
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
    fontWeight: '700',
    textTransform: 'uppercase',
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
    fontWeight: '700',
  },
  articleCount: {
    color: '#818CF8',
    fontSize: 13,
    fontWeight: '700',
  },
  warningBox: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#B45309',
    backgroundColor: '#451A03',
    padding: 12,
  },
  warningText: {
    color: '#FCD34D',
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  itemCard: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    gap: 12,
  },
  itemCode: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  tag: {
    backgroundColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700',
  },
  itemDesc: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 12,
  },
  itemStats: {
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
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  statLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statValue: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
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
    backgroundColor: '#16A34A',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  finalizeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
