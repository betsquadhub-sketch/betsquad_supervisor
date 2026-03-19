import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ethers } from 'ethers';
import axios from 'axios';

const CONTRACT_ADDRESS = process.env.EXPO_PUBLIC_CONTRACT_ADDRESS || '0x4a01c0964456488487f9dE593236958Fc7475bce';
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const POLYGON_RPC = process.env.EXPO_PUBLIC_POLYGON_RPC || 'https://polygon-rpc.com';

// Contract ABI (minimal for reading)
const CONTRACT_ABI = [
  'function owner() view returns (address)',
  'function houseFeePercent() view returns (uint256)',
  'function totalBets() view returns (uint256)',
  'function getBetInfo(uint256 betId) view returns (address creator, string title, string optionA, string optionB, uint256 deadline, uint8 status, uint256 optionAPool, uint256 optionBPool, uint8 winner)',
  'event Deposit(address indexed user, uint256 amount)',
  'event Withdraw(address indexed user, uint256 amount)',
];

interface Stats {
  contractBalance: string;
  contractBalanceUSD: number;
  totalBets: number;
  maticPrice: number;
  ownerAddress: string;
  houseFee: number;
  totalUsers: number;
  onlineUsers: number;
  // Calculated from events
  totalDeposited: string;
  totalWithdrawn: string;
}

export default function SupervisorDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchMaticPrice = async (): Promise<number> => {
    try {
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=matic-network&vs_currencies=usd',
        { timeout: 5000 }
      );
      return response.data['matic-network']?.usd || 0.45;
    } catch {
      return 0.45; // Default fallback
    }
  };

  const fetchContractStats = async () => {
    try {
      const provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

      // Fetch contract data
      const [balance, owner, houseFee, totalBets] = await Promise.all([
        provider.getBalance(CONTRACT_ADDRESS),
        contract.owner(),
        contract.houseFeePercent(),
        contract.totalBets(),
      ]);

      // Fetch MATIC price
      const maticPrice = await fetchMaticPrice();

      // Fetch deposit/withdraw events (last 10000 blocks)
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 10000);

      const depositFilter = contract.filters.Deposit();
      const withdrawFilter = contract.filters.Withdraw();

      let totalDeposited = ethers.BigNumber.from(0);
      let totalWithdrawn = ethers.BigNumber.from(0);

      try {
        const [depositEvents, withdrawEvents] = await Promise.all([
          contract.queryFilter(depositFilter, fromBlock, currentBlock),
          contract.queryFilter(withdrawFilter, fromBlock, currentBlock),
        ]);

        depositEvents.forEach((event: any) => {
          if (event.args?.amount) {
            totalDeposited = totalDeposited.add(event.args.amount);
          }
        });

        withdrawEvents.forEach((event: any) => {
          if (event.args?.amount) {
            totalWithdrawn = totalWithdrawn.add(event.args.amount);
          }
        });
      } catch (eventError) {
        console.log('Could not fetch events:', eventError);
      }

      const balanceInMatic = parseFloat(ethers.utils.formatEther(balance));

      return {
        contractBalance: balanceInMatic.toFixed(4),
        contractBalanceUSD: balanceInMatic * maticPrice,
        totalBets: totalBets.toNumber(),
        maticPrice,
        ownerAddress: owner,
        houseFee: houseFee.toNumber(),
        totalDeposited: parseFloat(ethers.utils.formatEther(totalDeposited)).toFixed(4),
        totalWithdrawn: parseFloat(ethers.utils.formatEther(totalWithdrawn)).toFixed(4),
      };
    } catch (error) {
      console.error('Contract fetch error:', error);
      throw error;
    }
  };

  const fetchBackendStats = async () => {
    try {
      // This requires admin endpoints - we'll try to get basic stats
      const response = await axios.get(`${BACKEND_URL}/api/admin/users`, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' },
      });
      return {
        totalUsers: response.data?.length || 0,
        onlineUsers: 0, // Would need real-time tracking
      };
    } catch {
      // If admin endpoint fails, return 0
      return { totalUsers: 0, onlineUsers: 0 };
    }
  };

  const loadAllStats = useCallback(async () => {
    try {
      const [contractStats, backendStats] = await Promise.all([
        fetchContractStats(),
        fetchBackendStats(),
      ]);

      setStats({
        ...contractStats,
        ...backendStats,
      });
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to load stats:', error);
      Alert.alert('Errore', 'Impossibile caricare i dati. Riprova.');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAllStats().finally(() => setLoading(false));

    // Auto refresh every 30 seconds
    const interval = setInterval(loadAllStats, 30000);
    return () => clearInterval(interval);
  }, [loadAllStats]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAllStats();
    setRefreshing(false);
  }, [loadAllStats]);

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>Caricamento dati...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6366f1"
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>BetSquad Supervisor</Text>
          <Text style={styles.subtitle}>Dashboard Amministratore</Text>
          {lastUpdate && (
            <Text style={styles.lastUpdate}>
              Ultimo aggiornamento: {lastUpdate.toLocaleTimeString('it-IT')}
            </Text>
          )}
        </View>

        {/* Contract Balance Card */}
        <View style={[styles.card, styles.balanceCard]}>
          <Text style={styles.cardLabel}>Saldo Smart Contract</Text>
          <Text style={styles.balanceValue}>{stats?.contractBalance || '0'} POL</Text>
          <Text style={styles.balanceUSD}>
            ≈ ${stats?.contractBalanceUSD?.toFixed(2) || '0.00'} USD
          </Text>
          <Text style={styles.cardSubtext}>
            Prezzo POL: ${stats?.maticPrice?.toFixed(4) || '0.00'}
          </Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {/* Total Deposited */}
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>📥</Text>
            <Text style={styles.statValue}>{stats?.totalDeposited || '0'}</Text>
            <Text style={styles.statLabel}>POL Depositati</Text>
            <Text style={styles.statSubtext}>(ultimi 10k blocchi)</Text>
          </View>

          {/* Total Withdrawn */}
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>📤</Text>
            <Text style={styles.statValue}>{stats?.totalWithdrawn || '0'}</Text>
            <Text style={styles.statLabel}>POL Prelevati</Text>
            <Text style={styles.statSubtext}>(ultimi 10k blocchi)</Text>
          </View>

          {/* Total Bets */}
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>🎲</Text>
            <Text style={styles.statValue}>{stats?.totalBets || 0}</Text>
            <Text style={styles.statLabel}>Scommesse Totali</Text>
          </View>

          {/* Total Users */}
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>👥</Text>
            <Text style={styles.statValue}>{stats?.totalUsers || 0}</Text>
            <Text style={styles.statLabel}>Utenti Registrati</Text>
          </View>
        </View>

        {/* Contract Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Info Contratto</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Indirizzo:</Text>
            <TouchableOpacity>
              <Text style={styles.infoValueLink}>{formatAddress(CONTRACT_ADDRESS)}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Owner:</Text>
            <Text style={styles.infoValue}>{stats?.ownerAddress ? formatAddress(stats.ownerAddress) : '-'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Commissione:</Text>
            <Text style={styles.infoValue}>{stats?.houseFee || 0}%</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Network:</Text>
            <Text style={styles.infoValue}>Polygon Mainnet</Text>
          </View>
        </View>

        {/* Quick Links */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Link Rapidi</Text>
          
          <TouchableOpacity style={styles.linkButton}>
            <Text style={styles.linkButtonText}>🔍 Vedi su PolygonScan</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkButton}>
            <Text style={styles.linkButtonText}>📊 Analisi Transazioni</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    color: '#9ca3af',
    marginTop: 4,
  },
  lastUpdate: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 8,
  },
  card: {
    backgroundColor: '#252540',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  balanceCard: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  cardLabel: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 8,
  },
  balanceValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#10b981',
  },
  balanceUSD: {
    fontSize: 18,
    color: '#6b7280',
    marginTop: 4,
  },
  cardSubtext: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statCard: {
    backgroundColor: '#252540',
    borderRadius: 12,
    padding: 16,
    width: '48%',
    marginBottom: 12,
    alignItems: 'center',
  },
  statIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
    textAlign: 'center',
  },
  statSubtext: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3f3f5a',
  },
  infoLabel: {
    fontSize: 14,
    color: '#9ca3af',
  },
  infoValue: {
    fontSize: 14,
    color: '#fff',
    fontFamily: 'monospace',
  },
  infoValueLink: {
    fontSize: 14,
    color: '#6366f1',
    fontFamily: 'monospace',
  },
  linkButton: {
    backgroundColor: '#3f3f5a',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    alignItems: 'center',
  },
  linkButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
});
