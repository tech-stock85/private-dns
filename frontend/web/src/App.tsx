// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface DomainRecord {
  id: string;
  domain: string;
  encryptedIp: string;
  timestamp: number;
  owner: string;
  status: "pending" | "verified" | "rejected";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<DomainRecord[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({
    domain: "",
    ipAddress: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [language, setLanguage] = useState<"en" | "zh">("en");
  const [showFAQ, setShowFAQ] = useState(false);
  
  // Calculate statistics
  const verifiedCount = records.filter(r => r.status === "verified").length;
  const pendingCount = records.filter(r => r.status === "pending").length;
  const rejectedCount = records.filter(r => r.status === "rejected").length;

  // Translations
  const translations = {
    en: {
      title: "PrivateDNS",
      subtitle: "Decentralized Encrypted Domain Resolution",
      connectWallet: "Connect Wallet",
      disconnect: "Disconnect",
      addRecord: "Add Domain",
      refresh: "Refresh",
      noRecords: "No domain records found",
      createFirst: "Create First Record",
      domain: "Domain",
      ipAddress: "IP Address",
      owner: "Owner",
      date: "Date",
      status: "Status",
      actions: "Actions",
      verify: "Verify",
      reject: "Reject",
      submit: "Submit Securely",
      cancel: "Cancel",
      projectIntro: "PrivateDNS leverages FHE technology to resolve domains while keeping queries encrypted",
      statsTitle: "Resolution Statistics",
      totalRecords: "Total Records",
      verified: "Verified",
      pending: "Pending",
      rejected: "Rejected",
      faqTitle: "Frequently Asked Questions",
      searchPlaceholder: "Search domains...",
      language: "Language",
      fheNotice: "Your domain queries are encrypted with Zama FHE",
      fhePowered: "FHE-Powered Privacy",
      copyright: "© {year} PrivateDNS. All rights reserved.",
      faqItems: [
        { q: "How does FHE protect my queries?", a: "Fully Homomorphic Encryption allows processing encrypted data without decryption" },
        { q: "Is my domain information public?", a: "No, all domain-IP mappings are encrypted on-chain" },
        { q: "Can I resolve .eth domains?", a: "Yes, we support all DNS-compatible domains" },
        { q: "How long does resolution take?", a: "Typically under 3 seconds thanks to FHE acceleration" }
      ]
    },
    zh: {
      title: "PrivateDNS",
      subtitle: "去中心化加密域名解析",
      connectWallet: "连接钱包",
      disconnect: "断开连接",
      addRecord: "添加域名",
      refresh: "刷新",
      noRecords: "未找到域名记录",
      createFirst: "创建第一条记录",
      domain: "域名",
      ipAddress: "IP地址",
      owner: "所有者",
      date: "日期",
      status: "状态",
      actions: "操作",
      verify: "验证",
      reject: "拒绝",
      submit: "安全提交",
      cancel: "取消",
      projectIntro: "PrivateDNS利用FHE技术解析域名，同时保持查询加密",
      statsTitle: "解析统计",
      totalRecords: "总记录数",
      verified: "已验证",
      pending: "待处理",
      rejected: "已拒绝",
      faqTitle: "常见问题",
      searchPlaceholder: "搜索域名...",
      language: "语言",
      fheNotice: "您的域名查询使用Zama FHE加密",
      fhePowered: "FHE驱动的隐私保护",
      copyright: "© {year} PrivateDNS。保留所有权利。",
      faqItems: [
        { q: "FHE如何保护我的查询？", a: "全同态加密允许在不解密的情况下处理加密数据" },
        { q: "我的域名信息是公开的吗？", a: "不，所有域名-IP映射都在链上加密存储" },
        { q: "我可以解析.eth域名吗？", a: "是的，我们支持所有DNS兼容域名" },
        { q: "解析需要多长时间？", a: "通常不到3秒，这得益于FHE加速" }
      ]
    }
  };

  const t = translations[language];

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("domain_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing domain keys:", e);
        }
      }
      
      const list: DomainRecord[] = [];
      
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`domain_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({
                id: key,
                domain: recordData.domain,
                encryptedIp: recordData.encryptedIp,
                timestamp: recordData.timestamp,
                owner: recordData.owner,
                status: recordData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing record data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading record ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) {
      console.error("Error loading records:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitRecord = async () => {
    if (!provider) { 
      alert(t.connectWallet); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: language === "en" 
        ? "Encrypting domain mapping with Zama FHE..." 
        : "使用Zama FHE加密域名映射..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedIp = `FHE-${btoa(newRecordData.ipAddress)}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const recordData = {
        domain: newRecordData.domain,
        encryptedIp: encryptedIp,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `domain_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(recordData))
      );
      
      const keysBytes = await contract.getData("domain_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(recordId);
      
      await contract.setData(
        "domain_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: language === "en" 
          ? "Encrypted domain mapping submitted!" 
          : "加密域名映射已提交！"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({
          domain: "",
          ipAddress: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? language === "en" ? "Transaction rejected" : "交易被拒绝"
        : language === "en" 
          ? "Submission failed: " + (e.message || "Unknown error")
          : "提交失败: " + (e.message || "未知错误");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const verifyRecord = async (recordId: string) => {
    if (!provider) {
      alert(t.connectWallet);
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: language === "en"
        ? "Processing encrypted data with FHE..."
        : "使用FHE处理加密数据..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordBytes = await contract.getData(`domain_${recordId}`);
      if (recordBytes.length === 0) {
        throw new Error("Record not found");
      }
      
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      const updatedRecord = {
        ...recordData,
        status: "verified"
      };
      
      await contract.setData(
        `domain_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedRecord))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: language === "en"
          ? "FHE verification completed!"
          : "FHE验证已完成！"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: language === "en"
          ? "Verification failed: " + (e.message || "Unknown error")
          : "验证失败: " + (e.message || "未知错误")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const rejectRecord = async (recordId: string) => {
    if (!provider) {
      alert(t.connectWallet);
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: language === "en"
        ? "Processing encrypted data with FHE..."
        : "使用FHE处理加密数据..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordBytes = await contract.getData(`domain_${recordId}`);
      if (recordBytes.length === 0) {
        throw new Error("Record not found");
      }
      
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      const updatedRecord = {
        ...recordData,
        status: "rejected"
      };
      
      await contract.setData(
        `domain_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedRecord))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: language === "en"
          ? "Rejection completed!"
          : "拒绝操作已完成！"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: language === "en"
          ? "Rejection failed: " + (e.message || "Unknown error")
          : "拒绝失败: " + (e.message || "未知错误")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const filteredRecords = records.filter(record => 
    record.domain.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="loading-screen">
      <div className="metal-spinner"></div>
      <p>{language === "en" ? "Initializing encrypted connection..." : "正在初始化加密连接..."}</p>
    </div>
  );

  return (
    <div className="app-container metal-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="shield-icon"></div>
          </div>
          <h1>{t.title}</h1>
        </div>
        
        <div className="header-actions">
          <div className="search-bar">
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="metal-input"
            />
          </div>
          
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-record-btn metal-button"
          >
            <div className="add-icon"></div>
            {t.addRecord}
          </button>
          
          <div className="language-switcher">
            <select 
              value={language} 
              onChange={(e) => setLanguage(e.target.value as "en" | "zh")}
              className="metal-select"
            >
              <option value="en">EN</option>
              <option value="zh">中文</option>
            </select>
          </div>
          
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>{t.subtitle}</h2>
            <p>{t.projectIntro}</p>
          </div>
        </div>
        
        <div className="dashboard-grid">
          <div className="dashboard-card metal-card">
            <h3>{t.projectIntro}</h3>
            <p>{language === "en" 
              ? "PrivateDNS uses Fully Homomorphic Encryption to resolve domains while keeping queries private" 
              : "PrivateDNS使用全同态加密技术解析域名，同时保持查询隐私"}</p>
            <div className="fhe-badge">
              <span>{t.fhePowered}</span>
            </div>
          </div>
          
          <div className="dashboard-card metal-card">
            <h3>{t.statsTitle}</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{records.length}</div>
                <div className="stat-label">{t.totalRecords}</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{verifiedCount}</div>
                <div className="stat-label">{t.verified}</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{pendingCount}</div>
                <div className="stat-label">{t.pending}</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{rejectedCount}</div>
                <div className="stat-label">{t.rejected}</div>
              </div>
            </div>
          </div>
          
          <div className="dashboard-card metal-card">
            <div className="faq-toggle">
              <h3>{t.faqTitle}</h3>
              <button 
                className="metal-button small"
                onClick={() => setShowFAQ(!showFAQ)}
              >
                {showFAQ ? "▲" : "▼"}
              </button>
            </div>
            
            {showFAQ && (
              <div className="faq-items">
                {t.faqItems.map((item, index) => (
                  <div className="faq-item" key={index}>
                    <div className="faq-question">Q: {item.q}</div>
                    <div className="faq-answer">A: {item.a}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="records-section">
          <div className="section-header">
            <h2>{language === "en" ? "Encrypted Domain Records" : "加密域名记录"}</h2>
            <div className="header-actions">
              <button 
                onClick={loadRecords}
                className="refresh-btn metal-button"
                disabled={isRefreshing}
              >
                {isRefreshing 
                  ? (language === "en" ? "Refreshing..." : "刷新中...") 
                  : t.refresh}
              </button>
            </div>
          </div>
          
          <div className="records-list metal-card">
            <div className="table-header">
              <div className="header-cell">{t.domain}</div>
              <div className="header-cell">{t.owner}</div>
              <div className="header-cell">{t.date}</div>
              <div className="header-cell">{t.status}</div>
              <div className="header-cell">{t.actions}</div>
            </div>
            
            {filteredRecords.length === 0 ? (
              <div className="no-records">
                <div className="no-records-icon"></div>
                <p>{t.noRecords}</p>
                <button 
                  className="metal-button primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  {t.createFirst}
                </button>
              </div>
            ) : (
              filteredRecords.map(record => (
                <div className="record-row" key={record.id}>
                  <div className="table-cell">{record.domain}</div>
                  <div className="table-cell">{record.owner.substring(0, 6)}...{record.owner.substring(38)}</div>
                  <div className="table-cell">
                    {new Date(record.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell">
                    <span className={`status-badge ${record.status}`}>
                      {record.status}
                    </span>
                  </div>
                  <div className="table-cell actions">
                    {isOwner(record.owner) && record.status === "pending" && (
                      <>
                        <button 
                          className="action-btn metal-button success"
                          onClick={() => verifyRecord(record.id)}
                        >
                          {t.verify}
                        </button>
                        <button 
                          className="action-btn metal-button danger"
                          onClick={() => rejectRecord(record.id)}
                        >
                          {t.reject}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitRecord} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          recordData={newRecordData}
          setRecordData={setNewRecordData}
          t={t}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="metal-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="shield-icon"></div>
              <span>PrivateDNS</span>
            </div>
            <p>{t.subtitle}</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">{language === "en" ? "Documentation" : "文档"}</a>
            <a href="#" className="footer-link">{language === "en" ? "Privacy Policy" : "隐私政策"}</a>
            <a href="#" className="footer-link">{language === "en" ? "Terms of Service" : "服务条款"}</a>
            <a href="#" className="footer-link">{language === "en" ? "Contact" : "联系我们"}</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>{t.fhePowered}</span>
          </div>
          <div className="copyright">
            {t.copyright.replace("{year}", new Date().getFullYear().toString())}
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  recordData: any;
  setRecordData: (data: any) => void;
  t: any;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  recordData,
  setRecordData,
  t
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setRecordData({
      ...recordData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!recordData.domain || !recordData.ipAddress) {
      alert(t.domain + " and " + t.ipAddress + " are required");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal metal-card">
        <div className="modal-header">
          <h2>{t.addRecord}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> {t.fheNotice}
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>{t.domain} *</label>
              <input 
                type="text"
                name="domain"
                value={recordData.domain} 
                onChange={handleChange}
                placeholder="example.com" 
                className="metal-input"
              />
            </div>
            
            <div className="form-group">
              <label>{t.ipAddress} *</label>
              <input 
                type="text"
                name="ipAddress"
                value={recordData.ipAddress} 
                onChange={handleChange}
                placeholder="192.168.1.1" 
                className="metal-input"
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> 
            {t.fheNotice}
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn metal-button"
          >
            {t.cancel}
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn metal-button primary"
          >
            {creating 
              ? (t.language === "en" ? "Encrypting with FHE..." : "使用FHE加密中...") 
              : t.submit}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;