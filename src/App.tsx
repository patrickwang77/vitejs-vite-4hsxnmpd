import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, TrendingUp, Settings, RefreshCw, AlertCircle, X, Filter, ArrowUp, ArrowDown, Moon, Sun, History } from 'lucide-react';

// --- 介面定義 ---

type MarketType = 'TW' | 'US';
type CurrencyType = 'TWD' | 'USD';

interface Transaction {
  id: string;
  date: string;
  ticker: string;
  name: string;
  type: 'buy' | 'sell';
  market: MarketType;
  price: number;
  shares: number;
  isETF: boolean;
  fee: number;
  tax: number;
  totalAmount: number;
}

interface Holding {
  ticker: string;
  name: string;
  market: MarketType;
  currency: CurrencyType;
  shares: number;       
  avgCost: number;      
  totalCost: number;    
  marketValue: number;  
  unrealizedPL: number; 
  roi: number;          
  isETF: boolean;
}

interface RealizedItem {
  ticker: string;
  name: string;
  market: MarketType;
  currency: CurrencyType;
  realizedPL: number;   
  totalCost: number;    
  totalRevenue: number; 
  roi: number;
  tradeCount: number;
  isETF: boolean; // 新增：為了在已實現列表也能顯示 ETF
}

interface AppSettings {
  // 台股設定
  twFeeRate: number;
  twDiscount: number;
  twTaxRateStock: number;
  twTaxRateETF: number;
  twMinFee: number;
  // 美股設定
  usFeeRate: number;    
  usMinFee: number;     
  usTaxRate: number;    
}

interface VisualSettings {
  darkMode: boolean;
  density: 'compact' | 'normal';
}

const DEFAULT_SETTINGS: AppSettings = {
  twFeeRate: 0.001425,
  twDiscount: 0.6,
  twTaxRateStock: 0.003,
  twTaxRateETF: 0.001,
  twMinFee: 20,
  usFeeRate: 0.001,   
  usMinFee: 0,        
  usTaxRate: 0.000008 
};

export default function StockTrackerApp() {
  // --- State 管理 ---
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [manualPrices, setManualPrices] = useState<Record<string, number>>({});

  // UI 狀態
  const [activeTab, setActiveTab] = useState<'portfolio' | 'realized' | 'transactions' | 'settings'>('portfolio');
  const [showAddModal, setShowAddModal] = useState(false);
  
  // 刪除控制
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null); // 單筆刪除
  const [deleteTargetTicker, setDeleteTargetTicker] = useState<string | null>(null); // 整檔刪除
  
  // 篩選與排序
  const [filterTicker, setFilterTicker] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // 視覺設定
  const [visualSettings, setVisualSettings] = useState<VisualSettings>({
    darkMode: false,
    density: 'normal'
  });

  // 新增交易表單
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    ticker: '',
    name: '',
    type: 'buy' as 'buy' | 'sell',
    market: 'TW' as MarketType,
    price: '',
    shares: '',
    isETF: false
  });

  // --- 初始化與資料保存 ---
  useEffect(() => {
    const savedData = localStorage.getItem('stock_tracker_data_v4');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        const migratedTransactions = (parsed.transactions || []).map((t: any) => ({
          ...t,
          market: t.market || 'TW'
        }));
        setTransactions(migratedTransactions);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
        setManualPrices(parsed.manualPrices || {});
        if (parsed.visualSettings) setVisualSettings(parsed.visualSettings);
      } catch (e) {
        console.error("讀取舊資料失敗", e);
      }
    }
  }, []);

  useEffect(() => {
    const dataToSave = { transactions, settings, manualPrices, visualSettings };
    localStorage.setItem('stock_tracker_data_v4', JSON.stringify(dataToSave));
  }, [transactions, settings, manualPrices, visualSettings]);


  // --- 核心邏輯 ---
  const { holdings, realizedGains } = useMemo(() => {
    const tempHoldings: Record<string, {
      ticker: string;
      name: string;
      market: MarketType;
      shares: number;
      totalCost: number; 
      isETF: boolean;
    }> = {};

    const tempRealized: Record<string, RealizedItem> = {};

    const sortedTrans = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sortedTrans.forEach(t => {
      // Init Holdings
      if (!tempHoldings[t.ticker]) {
        tempHoldings[t.ticker] = {
          ticker: t.ticker,
          name: t.name,
          market: t.market,
          shares: 0,
          totalCost: 0,
          isETF: t.isETF
        };
      }
      
      // Init Realized
      if (!tempRealized[t.ticker]) {
        tempRealized[t.ticker] = {
          ticker: t.ticker,
          name: t.name,
          market: t.market,
          currency: t.market === 'TW' ? 'TWD' : 'USD',
          realizedPL: 0,
          totalCost: 0,
          totalRevenue: 0,
          roi: 0,
          tradeCount: 0,
          isETF: t.isETF
        };
      }

      const h = tempHoldings[t.ticker];
      const r = tempRealized[t.ticker];

      if (t.type === 'buy') {
        h.totalCost += t.totalAmount;
        h.shares += t.shares;
      } else {
        if (h.shares > 0) {
          const avgCost = h.totalCost / h.shares;
          const costOfSoldShares = avgCost * t.shares;
          const realizedAmount = t.totalAmount - costOfSoldShares;
          
          h.totalCost -= costOfSoldShares;
          h.shares -= t.shares;

          r.realizedPL += realizedAmount;
          r.totalCost += costOfSoldShares;
          r.totalRevenue += t.totalAmount;
          r.tradeCount += 1;
        }
      }
      
      if (h.shares <= 0.000001) {
        h.shares = 0;
        h.totalCost = 0;
      }
    });

    const finalHoldings = Object.values(tempHoldings)
      .filter(h => h.shares > 0)
      .map(h => {
        const currentPrice = manualPrices[h.ticker] || 0;
        const avgCost = h.shares > 0 ? h.totalCost / h.shares : 0;
        
        let estSellFee = 0;
        let estSellTax = 0;

        if (h.market === 'TW') {
           estSellFee = Math.max(settings.twMinFee, Math.floor(currentPrice * h.shares * settings.twFeeRate * settings.twDiscount));
           estSellTax = Math.floor(currentPrice * h.shares * (h.isETF ? settings.twTaxRateETF : settings.twTaxRateStock));
        } else {
           estSellFee = Math.max(settings.usMinFee, (currentPrice * h.shares * settings.usFeeRate));
           estSellTax = (currentPrice * h.shares * settings.usTaxRate); 
        }

        const marketValue = (currentPrice * h.shares) - estSellFee - estSellTax;
        const unrealizedPL = marketValue - h.totalCost;
        const roi = h.totalCost > 0 ? (unrealizedPL / h.totalCost) * 100 : 0;

        return {
          ...h,
          currency: h.market === 'TW' ? 'TWD' : 'USD' as CurrencyType,
          avgCost,
          marketValue,
          unrealizedPL,
          roi
        } as Holding;
      });

    const finalRealized = Object.values(tempRealized)
      .filter(r => r.tradeCount > 0)
      .map(r => ({
        ...r,
        roi: r.totalCost > 0 ? (r.realizedPL / r.totalCost) * 100 : 0
      }));

    return { holdings: finalHoldings, realizedGains: finalRealized };

  }, [transactions, manualPrices, settings]);


  // --- 排序邏輯 ---
  const getSortedData = <T extends any>(data: T[]) => {
    if (!sortConfig) return data;
    return [...data].sort((a, b) => {
      // @ts-ignore
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      // @ts-ignore
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return <div className="w-3 h-3 ml-1 opacity-20"></div>;
    return sortConfig.direction === 'asc' ? <ArrowUp size={12} className="ml-1" /> : <ArrowDown size={12} className="ml-1" />;
  };

  // --- 交易紀錄篩選 ---
  const displayedTransactions = useMemo(() => {
    let list = [...transactions];
    if (filterTicker) {
      list = list.filter(t => t.ticker === filterTicker);
    }
    return list.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, filterTicker]);


  // --- 功能函數 ---
  const calculateTransactionAmount = (type: 'buy' | 'sell', market: MarketType, price: number, shares: number, isETF: boolean) => {
    const rawAmount = price * shares;
    let fee = 0;
    let tax = 0;

    if (market === 'TW') {
      fee = Math.max(settings.twMinFee, Math.floor(rawAmount * settings.twFeeRate * settings.twDiscount));
      tax = type === 'sell' ? Math.floor(rawAmount * (isETF ? settings.twTaxRateETF : settings.twTaxRateStock)) : 0;
    } else {
      fee = Math.max(settings.usMinFee, rawAmount * settings.usFeeRate);
      tax = type === 'sell' ? rawAmount * settings.usTaxRate : 0; 
    }
    
    let total = 0;
    if (type === 'buy') {
      total = rawAmount + fee; 
    } else {
      total = rawAmount - fee - tax; 
    }
    return { fee, tax, total };
  };

  const handleAddTransaction = () => {
    if (!form.ticker || !form.price || !form.shares) return;
    const priceNum = parseFloat(form.price);
    const sharesNum = parseFloat(form.shares);
    const { fee, tax, total } = calculateTransactionAmount(form.type, form.market, priceNum, sharesNum, form.isETF);

    const newTrans: Transaction = {
      id: Date.now().toString(),
      date: form.date,
      ticker: form.ticker.toUpperCase(),
      name: form.name || form.ticker.toUpperCase(),
      type: form.type,
      market: form.market,
      price: priceNum,
      shares: sharesNum,
      isETF: form.isETF,
      fee,
      tax,
      totalAmount: total
    };

    setTransactions([...transactions, newTrans]);
    if (form.type === 'buy') {
      setManualPrices(prev => ({...prev, [newTrans.ticker]: priceNum}));
    }
    setShowAddModal(false);
    setForm({ ...form, price: '', shares: '' });
  };

  const confirmDelete = () => {
    if (deleteTargetId) {
      setTransactions(transactions.filter(t => t.id !== deleteTargetId));
      setDeleteTargetId(null);
    }
  };

  // 確認刪除整檔
  const confirmDeleteTicker = () => {
    if (deleteTargetTicker) {
      setTransactions(prev => prev.filter(t => t.ticker !== deleteTargetTicker));
      setManualPrices(prev => {
         const next = { ...prev };
         delete next[deleteTargetTicker];
         return next;
      });
      setDeleteTargetTicker(null);
    }
  };

  const updatePrice = (ticker: string, newPrice: string) => {
    const price = parseFloat(newPrice);
    if (!isNaN(price)) {
      setManualPrices(prev => ({ ...prev, [ticker]: price }));
    }
  };

  const handleTickerClick = (ticker: string) => {
    setFilterTicker(ticker);
    setActiveTab('transactions');
  };

  const stats = useMemo(() => {
    const twHoldings = holdings.filter(h => h.market === 'TW');
    const usHoldings = holdings.filter(h => h.market === 'US');

    const calc = (list: Holding[]) => {
      const marketValue = list.reduce((sum, h) => sum + h.marketValue, 0);
      const totalCost = list.reduce((sum, h) => sum + h.totalCost, 0);
      const unrealizedPL = marketValue - totalCost;
      const roi = totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0;
      return { marketValue, totalCost, unrealizedPL, roi };
    };

    return { TW: calc(twHoldings), US: calc(usHoldings) };
  }, [holdings]);


  // --- UI 輔助 ---
  const isDark = visualSettings.darkMode;
  const isCompact = visualSettings.density === 'compact';

  const getColor = (val: number) => val > 0 ? 'text-red-500' : val < 0 ? 'text-green-500' : (isDark ? 'text-gray-400' : 'text-gray-500');
  const getBgColor = (val: number) => {
    if (val > 0) return isDark ? 'bg-red-900/30' : 'bg-red-50';
    if (val < 0) return isDark ? 'bg-green-900/30' : 'bg-green-50';
    return isDark ? 'bg-gray-700' : 'bg-gray-50';
  };
  
  const theme = {
    bg: isDark ? 'bg-gray-950' : 'bg-gray-100',
    text: isDark ? 'text-gray-100' : 'text-gray-800',
    subText: isDark ? 'text-gray-400' : 'text-gray-500',
    card: isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200',
    header: isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100',
    tableHeader: isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-50 text-gray-500',
    tableRowHover: isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50',
    input: isDark ? 'bg-gray-800 border-gray-700 text-white focus:bg-gray-700' : 'bg-white border-gray-200 text-gray-900 focus:bg-white',
    divider: isDark ? 'divide-gray-800' : 'divide-gray-100',
    buttonSecondary: isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700',
    activeTab: isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-600',
    inactiveTab: isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700',
    yellowBg: isDark ? 'bg-yellow-900/20 text-yellow-500 border-yellow-900' : 'bg-yellow-50 text-yellow-800 border-yellow-100',
    modalBg: isDark ? 'bg-gray-900' : 'bg-white',
    priceInput: isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-yellow-200 text-gray-800',
    priceInputWrapper: isDark ? 'bg-gray-800/50' : 'bg-yellow-50/30',
  };

  const paddingClass = isCompact ? 'px-3 py-2' : 'px-6 py-4';

  const formatCurrency = (val: number, currency: CurrencyType) => {
    return new Intl.NumberFormat('zh-TW', { 
      style: 'currency', 
      currency: currency,
      maximumFractionDigits: currency === 'TWD' ? 0 : 2,
      minimumFractionDigits: currency === 'TWD' ? 0 : 2
    }).format(val);
  };
  
  const formatNumber = (val: number, decimals: number = 0) => new Intl.NumberFormat('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(val);

  return (
    <div className={`min-h-screen font-sans transition-colors duration-200 ${theme.bg} ${theme.text}`}>
      
      {/* Header */}
      <header className={`shadow-sm sticky top-0 z-10 transition-colors ${theme.header}`}>
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-red-600 p-2 rounded-lg text-white">
              <TrendingUp size={20} />
            </div>
            <h1 className="text-xl font-bold hidden md:block">持股損益追蹤</h1>
          </div>
          <div className="flex space-x-1 overflow-x-auto no-scrollbar">
             <button onClick={() => setActiveTab('portfolio')} className={`px-3 py-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors ${activeTab === 'portfolio' ? theme.activeTab : theme.inactiveTab}`}>持股損益</button>
             <button onClick={() => setActiveTab('realized')} className={`px-3 py-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors ${activeTab === 'realized' ? theme.activeTab : theme.inactiveTab}`}>已實現損益</button>
             <button onClick={() => setActiveTab('transactions')} className={`px-3 py-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors ${activeTab === 'transactions' ? theme.activeTab : theme.inactiveTab}`}>交易紀錄</button>
             <button onClick={() => setActiveTab('settings')} className={`p-2 rounded-full transition-colors ${activeTab === 'settings' ? 'text-red-600' : theme.buttonSecondary}`}><Settings size={20} /></button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        
        {/* Dashboard Cards */}
        {activeTab === 'portfolio' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* TWD Card */}
              <div className={`rounded-xl shadow-sm border p-4 ${theme.card}`}>
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center font-bold text-gray-700 dark:text-gray-200">
                    <span className="mr-2">🇹🇼</span> 台股資產 (TWD)
                  </div>
                  <div className={`text-sm ${getColor(stats.TW.roi)} font-bold`}>
                    ROI: {stats.TW.roi > 0 ? '+' : ''}{stats.TW.roi.toFixed(2)}%
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className={`text-xs ${theme.subText} mb-1`}>總市值</p>
                    <p className="font-bold text-lg">{formatCurrency(stats.TW.marketValue, 'TWD')}</p>
                  </div>
                  <div>
                    <p className={`text-xs ${theme.subText} mb-1`}>總成本</p>
                    <p className="font-bold text-lg">{formatCurrency(stats.TW.totalCost, 'TWD')}</p>
                  </div>
                  <div>
                    <p className={`text-xs ${theme.subText} mb-1`}>未實現</p>
                    <p className={`font-bold text-lg ${getColor(stats.TW.unrealizedPL)}`}>
                      {stats.TW.unrealizedPL > 0 ? '+' : ''}{formatNumber(stats.TW.unrealizedPL)}
                    </p>
                  </div>
                </div>
              </div>

              {/* USD Card */}
              <div className={`rounded-xl shadow-sm border p-4 ${theme.card}`}>
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center font-bold text-gray-700 dark:text-gray-200">
                    <span className="mr-2">🇺🇸</span> 美股資產 (USD)
                  </div>
                  <div className={`text-sm ${getColor(stats.US.roi)} font-bold`}>
                    ROI: {stats.US.roi > 0 ? '+' : ''}{stats.US.roi.toFixed(2)}%
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className={`text-xs ${theme.subText} mb-1`}>總市值</p>
                    <p className="font-bold text-lg">{formatCurrency(stats.US.marketValue, 'USD')}</p>
                  </div>
                  <div>
                    <p className={`text-xs ${theme.subText} mb-1`}>總成本</p>
                    <p className="font-bold text-lg">{formatCurrency(stats.US.totalCost, 'USD')}</p>
                  </div>
                  <div>
                    <p className={`text-xs ${theme.subText} mb-1`}>未實現</p>
                    <p className={`font-bold text-lg ${getColor(stats.US.unrealizedPL)}`}>
                      {stats.US.unrealizedPL > 0 ? '+' : ''}{formatNumber(stats.US.unrealizedPL, 2)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Portfolio Table */}
            <div className={`rounded-xl shadow-sm border overflow-hidden transition-colors ${theme.card}`}>
              <div className={`px-6 py-4 border-b flex justify-between items-center ${isDark ? 'border-gray-800' : 'border-gray-100 bg-gray-50'}`}>
                <h2 className="font-semibold">持股明細</h2>
                <button 
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center space-x-1 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
                >
                  <Plus size={16} />
                  <span>記一筆</span>
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className={`${isDark ? 'bg-gray-900 text-gray-500' : 'bg-white text-gray-600'} border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
                    <tr>
                      <th className={`${paddingClass} font-semibold text-xs uppercase tracking-wider`}><button onClick={() => requestSort('ticker')} className="flex items-center">代號 {getSortIcon('ticker')}</button></th>
                      <th className={`${paddingClass} font-semibold text-xs uppercase tracking-wider`}><button onClick={() => requestSort('market')} className="flex items-center">市場 {getSortIcon('market')}</button></th>
                      <th className={`${paddingClass} font-semibold text-xs uppercase tracking-wider text-right`}><button onClick={() => requestSort('shares')} className="flex items-center ml-auto">股數 {getSortIcon('shares')}</button></th>
                      <th className={`${paddingClass} font-semibold text-xs uppercase tracking-wider text-right`}><button onClick={() => requestSort('avgCost')} className="flex items-center ml-auto">均價 {getSortIcon('avgCost')}</button></th>
                      <th className={`${paddingClass} font-semibold text-xs uppercase tracking-wider text-right w-32 ${isDark ? 'bg-yellow-900/20 text-yellow-600 border-yellow-800' : 'bg-yellow-50/60 text-yellow-800 border-yellow-100'} border-b`}>現價 (輸入)</th>
                      <th className={`${paddingClass} font-semibold text-xs uppercase tracking-wider text-right`}><button onClick={() => requestSort('marketValue')} className="flex items-center ml-auto">市值 {getSortIcon('marketValue')}</button></th>
                      <th className={`${paddingClass} font-semibold text-xs uppercase tracking-wider text-right`}><button onClick={() => requestSort('unrealizedPL')} className="flex items-center ml-auto">損益 {getSortIcon('unrealizedPL')}</button></th>
                      <th className={`${paddingClass} font-semibold text-xs uppercase tracking-wider text-right`}><button onClick={() => requestSort('roi')} className="flex items-center ml-auto">報酬率 {getSortIcon('roi')}</button></th>
                      <th className={`${paddingClass} font-semibold text-xs uppercase tracking-wider text-center`}>操作</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${theme.divider}`}>
                    {getSortedData(holdings).length === 0 ? (
                      <tr><td colSpan={9} className={`px-6 py-8 text-center ${theme.subText}`}>無持倉，請新增交易</td></tr>
                    ) : getSortedData(holdings).map((h) => (
                      <tr key={h.ticker} className={`transition-colors ${theme.tableRowHover}`}>
                        <td className={paddingClass}>
                          <button
                            onClick={() => handleTickerClick(h.ticker)}
                            className="text-left group"
                          >
                            <div className={`font-bold text-base group-hover:underline transition-colors ${
                              h.market === 'TW'
                                ? (isDark ? 'text-teal-400 group-hover:text-teal-300' : 'text-teal-600 group-hover:text-teal-700')
                                : (isDark ? 'text-blue-400 group-hover:text-blue-300' : 'text-blue-600 group-hover:text-blue-700')
                            }`}>{h.ticker}</div>
                            <div className={`text-xs ${theme.subText}`}>{h.name}</div>
                          </button>
                        </td>
                        <td className={paddingClass}>
                          <div className="flex items-center space-x-1">
                             <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${
                               h.market === 'TW'
                                 ? (isDark ? 'bg-teal-900/20 text-teal-400 border-teal-700' : 'bg-teal-50 text-teal-700 border-teal-200')
                                 : (isDark ? 'bg-blue-900/20 text-blue-400 border-blue-700' : 'bg-blue-50 text-blue-700 border-blue-200')
                             }`}>
                                {h.market}
                             </span>
                             {h.isETF && (
                                <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${
                                  isDark
                                    ? 'bg-amber-900/20 border-amber-700 text-amber-400'
                                    : 'bg-amber-50 border-amber-200 text-amber-700'
                                }`}>
                                   ETF
                                </span>
                             )}
                          </div>
                        </td>
                        <td className={`${paddingClass} text-right font-medium`}>{formatNumber(h.shares, h.market === 'US' ? 2 : 0)}</td>
                        <td className={`${paddingClass} text-right ${theme.subText}`}>{formatNumber(h.avgCost, 2)}</td>
                        <td className={`${paddingClass} text-right ${theme.priceInputWrapper}`}>
                          <input
                            type="number"
                            className={`w-20 text-right p-1 border rounded focus:ring-2 focus:ring-red-500 outline-none font-bold shadow-sm ${theme.priceInput}`}
                            value={manualPrices[h.ticker] || ''}
                            placeholder="輸入"
                            onChange={(e) => updatePrice(h.ticker, e.target.value)}
                          />
                        </td>
                        <td className={`${paddingClass} text-right font-medium`}>{formatCurrency(h.marketValue, h.currency)}</td>
                        <td className={`${paddingClass} text-right font-bold ${getColor(h.unrealizedPL)}`}>
                          {h.unrealizedPL > 0 ? '+' : ''}{formatNumber(h.unrealizedPL, h.market === 'US' ? 2 : 0)}
                        </td>
                        <td className={`${paddingClass} text-right`}>
                          <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${getBgColor(h.roi)} ${getColor(h.roi)}`}>
                             {h.roi > 0 ? '+' : ''}{h.roi.toFixed(2)}%
                          </span>
                        </td>
                        <td className={`${paddingClass} text-center`}>
                          <button
                            onClick={() => setDeleteTargetTicker(h.ticker)}
                            className={`${theme.buttonSecondary} p-1 transition-colors hover:text-red-500`}
                            title="刪除此檔股票所有紀錄"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Realized Gains Tab */}
        {activeTab === 'realized' && (
          <div className={`rounded-xl shadow-sm border transition-colors ${theme.card}`}>
            <div className={`px-6 py-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-100 bg-gray-50'}`}>
              <h2 className="font-semibold flex items-center"><History size={18} className="mr-2"/>已實現損益 (已賣出)</h2>
            </div>
             <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className={`${theme.tableHeader}`}>
                    <tr>
                      <th className={`${paddingClass} font-medium`}>標的</th>
                      <th className={`${paddingClass} font-medium`}>市場</th>
                      <th className={`${paddingClass} font-medium text-right`}>賣出總收入</th>
                      <th className={`${paddingClass} font-medium text-right`}>總成本</th>
                      <th className={`${paddingClass} font-medium text-right`}>已實現損益</th>
                      <th className={`${paddingClass} font-medium text-right`}>報酬率</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${theme.divider}`}>
                    {realizedGains.length === 0 ? (
                      <tr><td colSpan={6} className={`px-6 py-8 text-center ${theme.subText}`}>尚無已實現損益紀錄</td></tr>
                    ) : realizedGains.map((r) => (
                      <tr key={r.ticker} className={`transition-colors ${theme.tableRowHover}`}>
                         <td className={paddingClass}>
                          <button 
                            onClick={() => handleTickerClick(r.ticker)}
                            className="text-left group"
                            title="查看交易紀錄"
                          >
                            <div className="font-bold group-hover:text-blue-500 group-hover:underline">{r.ticker}</div>
                            <div className={`text-xs ${theme.subText}`}>{r.name}</div>
                          </button>
                        </td>
                        <td className={paddingClass}>
                          <div className="flex items-center space-x-1">
                             <span className={`px-1.5 py-0.5 rounded text-[10px] border ${r.market === 'TW' ? 'border-green-200 text-green-600' : 'border-blue-200 text-blue-600'}`}>
                                {r.market}
                             </span>
                             {r.isETF && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] border border-purple-200 text-purple-600 bg-purple-50 dark:bg-purple-900/40 dark:border-purple-800 dark:text-purple-300`}>
                                   ETF
                                </span>
                             )}
                          </div>
                        </td>
                        <td className={`${paddingClass} text-right`}>{formatCurrency(r.totalRevenue, r.currency)}</td>
                        <td className={`${paddingClass} text-right ${theme.subText}`}>{formatCurrency(r.totalCost, r.currency)}</td>
                        <td className={`${paddingClass} text-right font-bold ${getColor(r.realizedPL)}`}>
                          {r.realizedPL > 0 ? '+' : ''}{formatCurrency(r.realizedPL, r.currency)}
                        </td>
                         <td className={`${paddingClass} text-right`}>
                          <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${getBgColor(r.roi)} ${getColor(r.roi)}`}>
                             {r.roi > 0 ? '+' : ''}{r.roi.toFixed(2)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          </div>
        )}

        {/* Transactions Tab */}
        {activeTab === 'transactions' && (
          <div className={`rounded-xl shadow-sm border transition-colors ${theme.card}`}>
             <div className={`px-6 py-4 border-b flex flex-col md:flex-row md:justify-between md:items-center gap-4 ${isDark ? 'border-gray-800' : 'border-gray-100 bg-gray-50'}`}>
                <div className="flex items-center space-x-4">
                  <h2 className="font-semibold">歷史交易明細</h2>
                  {filterTicker && (
                    <div className="flex items-center bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full text-sm">
                      <Filter size={14} className="mr-1" />
                      <span>篩選：{filterTicker}</span>
                      <button onClick={() => setFilterTicker(null)} className="ml-2 hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5 transition-colors"><X size={14} /></button>
                    </div>
                  )}
                </div>
                <button 
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center justify-center space-x-1 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-sm"
                >
                  <Plus size={16} />
                  <span>記一筆</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className={`${theme.tableHeader}`}>
                    <tr>
                      <th className={`${paddingClass} font-medium`}>日期</th>
                      <th className={`${paddingClass} font-medium`}>市場</th>
                      <th className={`${paddingClass} font-medium`}>類別</th>
                      <th className={`${paddingClass} font-medium`}>標的</th>
                      <th className={`${paddingClass} font-medium text-right`}>價格</th>
                      <th className={`${paddingClass} font-medium text-right`}>股數</th>
                      <th className={`${paddingClass} font-medium text-right`}>總費用</th>
                      <th className={`${paddingClass} font-medium text-right`}>交割金額</th>
                      <th className={`${paddingClass} font-medium text-center`}>操作</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${theme.divider}`}>
                    {displayedTransactions.length === 0 ? (
                       <tr><td colSpan={9} className={`px-6 py-8 text-center ${theme.subText}`}>{filterTicker ? '此代號無交易紀錄' : '尚無紀錄'}</td></tr>
                    ) : displayedTransactions.map((t) => (
                      <tr key={t.id} className={`transition-colors ${theme.tableRowHover}`}>
                        <td className={`${paddingClass} ${theme.subText}`}>{t.date}</td>
                        <td className={paddingClass}>
                           <span className={`text-[10px] font-bold px-1 rounded ${t.market === 'TW' ? 'text-green-600 bg-green-50' : 'text-blue-600 bg-blue-50'}`}>{t.market}</span>
                        </td>
                        <td className={paddingClass}>
                          <span className={`px-2 py-0.5 rounded text-xs ${t.type === 'buy' ? (isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-600') : (isDark ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-600')}`}>
                            {t.type === 'buy' ? '買進' : '賣出'}
                          </span>
                        </td>
                        <td className={`${paddingClass} font-medium`}>
                           <div>{t.name}</div>
                           <div className={`text-xs ${theme.subText}`}>{t.ticker}</div>
                        </td>
                        <td className={`${paddingClass} text-right ${theme.subText}`}>{formatNumber(t.price, 2)}</td>
                        <td className={`${paddingClass} text-right ${theme.subText}`}>{formatNumber(t.shares, t.market === 'US' ? 2 : 0)}</td>
                        <td className={`${paddingClass} text-right ${theme.subText}`}>{formatNumber(t.fee + t.tax, 2)}</td>
                        <td className={`${paddingClass} text-right font-medium`}>
                          {t.market === 'TW' ? 'NT$' : 'US$'} {formatNumber(t.totalAmount, 0)}
                        </td>
                        <td className={`${paddingClass} text-center`}>
                          <button onClick={() => setDeleteTargetId(t.id)} className={`${theme.buttonSecondary} p-1 transition-colors hover:text-red-500`}><Trash2 size={16} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className={`rounded-xl shadow-sm border max-w-lg mx-auto p-6 transition-colors ${theme.card}`}>
            <h2 className="text-lg font-bold mb-6 flex items-center"><Settings className="mr-2" size={20}/> 設定</h2>
            
            <div className={`space-y-6 ${theme.divider} divide-y`}>
              <div className="space-y-4">
                 <h3 className={`text-sm font-semibold uppercase tracking-wider ${theme.subText}`}>外觀風格</h3>
                 <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">{isDark ? <Moon size={18} className="text-purple-400"/> : <Sun size={18} className="text-orange-400"/>}<span>深色模式</span></div>
                    <button onClick={() => setVisualSettings({...visualSettings, darkMode: !isDark})} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isDark ? 'bg-purple-600' : 'bg-gray-200'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${isDark ? 'translate-x-6' : 'translate-x-1'}`} /></button>
                 </div>
              </div>

              {/* 台股參數 */}
              <div className="space-y-4 pt-4">
                 <h3 className={`text-sm font-semibold uppercase tracking-wider flex items-center text-green-600`}>
                   <span className="mr-2">🇹🇼</span> 台股參數 (TWD)
                 </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${theme.subText}`}>折扣 (e.g. 0.6)</label>
                    <input type="number" step="0.01" value={settings.twDiscount} onChange={(e) => setSettings({...settings, twDiscount: parseFloat(e.target.value)})} className={`w-full p-2 border rounded ${theme.input}`} />
                  </div>
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${theme.subText}`}>手續費率 (0.001425)</label>
                    <input type="number" value={settings.twFeeRate} readOnly className={`w-full p-2 border rounded opacity-60 ${theme.input}`} />
                  </div>
                </div>
              </div>

              {/* 美股參數 */}
              <div className="space-y-4 pt-4">
                 <h3 className={`text-sm font-semibold uppercase tracking-wider flex items-center text-blue-600`}>
                   <span className="mr-2">🇺🇸</span> 美股參數 (USD)
                 </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${theme.subText}`}>手續費率 (0.001 = 0.1%)</label>
                    <input type="number" step="0.0001" value={settings.usFeeRate} onChange={(e) => setSettings({...settings, usFeeRate: parseFloat(e.target.value)})} className={`w-full p-2 border rounded ${theme.input}`} />
                  </div>
                   <div>
                    <label className={`block text-xs font-medium mb-1 ${theme.subText}`}>美股低消 (USD)</label>
                    <input type="number" step="1" value={settings.usMinFee} onChange={(e) => setSettings({...settings, usMinFee: parseFloat(e.target.value)})} className={`w-full p-2 border rounded ${theme.input}`} />
                  </div>
                  <div className="col-span-2">
                    <label className={`block text-xs font-medium mb-1 ${theme.subText}`}>SEC 費率 (賣出收，約 0.000008)</label>
                    <input type="number" step="0.000001" value={settings.usTaxRate} onChange={(e) => setSettings({...settings, usTaxRate: parseFloat(e.target.value)})} className={`w-full p-2 border rounded ${theme.input}`} />
                  </div>
                </div>
              </div>
              
              <div className="pt-4">
                <button onClick={() => { setSettings(DEFAULT_SETTINGS); alert('已恢復預設值'); }} className={`text-sm flex items-center ${theme.buttonSecondary}`}><RefreshCw size={14} className="mr-1"/> 恢復交易參數預設值</button>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Add Transaction Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in-up transition-colors ${theme.modalBg}`}>
            <div className={`px-6 py-4 border-b flex justify-between items-center ${isDark ? 'border-gray-800' : 'border-gray-100 bg-gray-50'}`}>
              <h3 className="font-bold">新增交易</h3>
              <button onClick={() => setShowAddModal(false)} className={theme.buttonSecondary}><X size={20} /></button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* 市場選擇 */}
              <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg mb-2">
                 <button onClick={() => setForm({...form, market: 'TW'})} className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-all ${form.market === 'TW' ? 'bg-white text-green-600 shadow' : 'text-gray-500'}`}>🇹🇼 台股 (TWD)</button>
                 <button onClick={() => setForm({...form, market: 'US'})} className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-all ${form.market === 'US' ? 'bg-white text-blue-600 shadow' : 'text-gray-500'}`}>🇺🇸 美股 (USD)</button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-medium mb-1 ${theme.subText}`}>日期</label>
                  <input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})} className={`w-full p-2 border rounded ${theme.input}`} />
                </div>
                <div>
                   <label className={`block text-xs font-medium mb-1 ${theme.subText}`}>交易類別</label>
                   <div className={`flex rounded p-1 ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                     <button onClick={() => setForm({...form, type: 'buy'})} className={`flex-1 py-1 rounded text-sm font-medium transition-colors ${form.type === 'buy' ? 'bg-red-500 text-white shadow' : theme.subText}`}>買進</button>
                     <button onClick={() => setForm({...form, type: 'sell'})} className={`flex-1 py-1 rounded text-sm font-medium transition-colors ${form.type === 'sell' ? 'bg-green-500 text-white shadow' : theme.subText}`}>賣出</button>
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className={`block text-xs font-medium mb-1 ${theme.subText}`}>代號</label>
                  <input type="text" placeholder={form.market === 'TW' ? "2330" : "AAPL"} value={form.ticker} onChange={(e) => setForm({...form, ticker: e.target.value})} className={`w-full p-2 border rounded uppercase ${theme.input}`} />
                </div>
                <div>
                   <label className={`block text-xs font-medium mb-1 ${theme.subText}`}>名稱</label>
                   <input type="text" placeholder="選填" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className={`w-full p-2 border rounded ${theme.input}`} />
                </div>
              </div>

              {form.market === 'TW' && (
                <div className="flex items-center space-x-2">
                   <input type="checkbox" id="isETF" checked={form.isETF} onChange={(e) => setForm({...form, isETF: e.target.checked})} className="rounded text-red-600 focus:ring-red-500"/>
                   <label htmlFor="isETF" className={`text-sm ${theme.text}`}>這檔是 ETF (證交稅 0.1%)</label>
                </div>
              )}
               {form.market === 'US' && (
                <div className="flex items-center space-x-2">
                   <input type="checkbox" id="isETF_US" checked={form.isETF} onChange={(e) => setForm({...form, isETF: e.target.checked})} className="rounded text-blue-600 focus:ring-blue-500"/>
                   <label htmlFor="isETF_US" className={`text-sm ${theme.text}`}>這檔是 ETF (標記用)</label>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-medium mb-1 ${theme.subText}`}>成交價格 ({form.market === 'TW' ? 'NT$' : 'US$'})</label>
                  <input type="number" step="0.01" value={form.price} onChange={(e) => setForm({...form, price: e.target.value})} className={`w-full p-2 border rounded ${theme.input}`} />
                </div>
                <div>
                  <label className={`block text-xs font-medium mb-1 ${theme.subText}`}>成交股數</label>
                  <input type="number" step={form.market === 'US' ? "0.0001" : "1"} value={form.shares} onChange={(e) => setForm({...form, shares: e.target.value})} className={`w-full p-2 border rounded ${theme.input}`} />
                </div>
              </div>

              <div className={`p-3 rounded text-xs flex items-start ${theme.yellowBg}`}>
                 <span className="mr-2">💡</span>
                 <span>
                    {form.type === 'buy' ? '買進總金額' : '賣出淨收入'} 預估： 
                    <strong className="text-lg ml-1">
                      {form.market === 'TW' ? 'NT$' : 'US$'}
                      {form.price && form.shares ? formatNumber(calculateTransactionAmount(form.type, form.market, parseFloat(form.price), parseFloat(form.shares), form.isETF).total, 2) : 0}
                    </strong>
                 </span>
              </div>

              <button onClick={handleAddTransaction} disabled={!form.ticker || !form.price || !form.shares} className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all">確認新增</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Transaction Modal */}
      {deleteTargetId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
           <div className={`rounded-lg shadow-xl p-6 max-w-sm w-full transition-colors ${theme.modalBg}`}>
              <div className="flex flex-col items-center text-center">
                 <div className="bg-red-100 p-3 rounded-full text-red-600 mb-4"><AlertCircle size={32} /></div>
                 <h3 className="text-lg font-bold mb-2">確定刪除此交易？</h3>
                 <p className={`text-sm mb-6 ${theme.subText}`}>刪除後將無法復原，庫存成本將會重新計算。</p>
                 <div className="flex space-x-3 w-full">
                    <button onClick={() => setDeleteTargetId(null)} className={`flex-1 py-2 border rounded-lg font-medium ${isDark ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-50 text-gray-700'}`}>取消</button>
                    <button onClick={confirmDelete} className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium shadow-sm">確認刪除</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Delete Ticker Modal (整檔刪除) */}
      {deleteTargetTicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
           <div className={`rounded-lg shadow-xl p-6 max-w-sm w-full transition-colors ${theme.modalBg}`}>
              <div className="flex flex-col items-center text-center">
                 <div className="bg-red-100 p-3 rounded-full text-red-600 mb-4"><AlertCircle size={32} /></div>
                 <h3 className="text-lg font-bold mb-2">確定刪除 {deleteTargetTicker}？</h3>
                 <p className={`text-sm mb-6 ${theme.subText}`}>
                    這將會刪除該代號的<strong className="text-red-500">所有歷史交易紀錄</strong>且無法復原。
                 </p>
                 <div className="flex space-x-3 w-full">
                    <button onClick={() => setDeleteTargetTicker(null)} className={`flex-1 py-2 border rounded-lg font-medium ${isDark ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-50 text-gray-700'}`}>取消</button>
                    <button onClick={confirmDeleteTicker} className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium shadow-sm">確認刪除</button>
                 </div>
              </div>
           </div>
        </div>
      )}
      
    </div>
  );
}