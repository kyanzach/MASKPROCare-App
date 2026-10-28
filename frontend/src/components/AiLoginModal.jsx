import { useState, useEffect, useRef } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function AiLoginModal({ isOpen, onClose, initialMobile = '' }) {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [sessionToken, setSessionToken] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [currentStep, setCurrentStep] = useState('init');
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [errorNotice, setErrorNotice] = useState('');

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Initialize session when modal opens
  useEffect(() => {
    if (isOpen) {
      startSession();
    } else {
      resetState();
    }
  }, [isOpen]);

  const resetState = () => {
    setSessionToken(null);
    setMessages([]);
    setInputText('');
    setCurrentStep('init');
    setLoading(false);
    setIsTyping(false);
    setVerificationResult(null);
    setErrorNotice('');
  };

  const startSession = async () => {
    setLoading(true);
    setErrorNotice('');
    try {
      const res = await api.post('/auth/ai-login/session');
      if (res.data.success) {
        setSessionToken(res.data.data.session_token);
        setCurrentStep(res.data.data.step || 'name');
        setMessages([
          {
            sender: 'ai',
            text: res.data.data.message || "Hello! I'm Izumi, your MaskPro Care Assistant. Don't worry if your SMS code hasn't arrived. I can verify your identity through a few quick questions so you can log in safely.\n\nTo begin, what is your full name?",
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        setTimeout(() => inputRef.current?.focus(), 300);
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || 'Unable to connect to AI assistant. Please try again.';
      setErrorNotice(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text || !sessionToken || loading || isTyping) return;

    // Append user message
    const userMsg = {
      sender: 'user',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);
    setErrorNotice('');

    try {
      const res = await api.post('/auth/ai-login/message', {
        session_token: sessionToken,
        message: text
      });

      setIsTyping(false);

      if (res.data.success) {
        // If final step was completed and verified
        if (res.data.verified && res.data.token) {
          const aiMsg = {
            sender: 'ai',
            text: res.data.message,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            verified: true,
            score: res.data.score
          };
          setMessages(prev => [...prev, aiMsg]);
          setVerificationResult({ verified: true, score: res.data.score });

          // Auto-login and navigate after 1.8 seconds
          setTimeout(() => {
            login(res.data.token, res.data.customer);
            onClose();
            navigate('/');
          }, 1800);
        } else {
          // Normal step progression
          const aiMsg = {
            sender: 'ai',
            text: res.data.data?.message || 'Thank you! Next question...',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
          setMessages(prev => [...prev, aiMsg]);
          setCurrentStep(res.data.data?.step || '');
          setTimeout(() => inputRef.current?.focus(), 200);
        }
      } else {
        // Verification failed or threshold not reached
        const aiMsg = {
          sender: 'ai',
          text: res.data.message || 'Verification could not be completed with 90% confidence.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          failed: true,
          score: res.data.score || 0
        };
        setMessages(prev => [...prev, aiMsg]);
        setVerificationResult({ verified: false, score: res.data.score || 0 });
      }
    } catch (err) {
      setIsTyping(false);
      const errMsg = err.response?.data?.message || 'Connection error. Please try again.';
      setErrorNotice(errMsg);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          height: '620px',
          maxHeight: '90vh',
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.25s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #1e3a8a, #0284c7)',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                border: '2px solid rgba(255, 255, 255, 0.3)',
              }}
            >
              <i className="fas fa-robot" style={{ color: '#ffffff' }}></i>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Izumi AI Login Helper
                <span
                  style={{
                    fontSize: '10px',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: '#22c55e',
                    color: '#ffffff',
                    fontWeight: 600,
                  }}
                >
                  ONLINE
                </span>
              </div>
              <div style={{ fontSize: '12px', opacity: 0.85 }}>Identity Verification Assistant</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              color: '#ffffff',
              fontSize: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Security Info Banner */}
        <div
          style={{
            padding: '8px 16px',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            fontSize: '11px',
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="fas fa-shield-alt" style={{ color: '#0284c7' }}></i>
          <span>SMS delayed? Answer 5 security questions (90% match required).</span>
        </div>

        {/* Error Alert */}
        {errorNotice && (
          <div
            style={{
              margin: '12px 16px 0',
              padding: '10px 14px',
              background: '#fee2e2',
              color: '#b91c1c',
              borderRadius: '10px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <i className="fas fa-exclamation-circle"></i>
            <span>{errorNotice}</span>
          </div>
        )}

        {/* Chat Message Stream */}
        <div
          style={{
            flex: 1,
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            background: '#f8fafc',
          }}
        >
          {loading && (
            <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
              <div className="spinner" style={{ margin: '0 auto 12px', width: '28px', height: '28px' }}></div>
              <span style={{ fontSize: '13px' }}>Connecting to Izumi Assistant...</span>
            </div>
          )}

          {messages.map((msg, index) => {
            const isAi = msg.sender === 'ai';
            return (
              <div
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: isAi ? 'flex-start' : 'flex-end',
                  alignItems: 'flex-end',
                  gap: '8px',
                }}
              >
                {isAi && (
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: '#0284c7',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      flexShrink: 0,
                    }}
                  >
                    <i className="fas fa-robot"></i>
                  </div>
                )}
                <div
                  style={{
                    maxWidth: '82%',
                    padding: '12px 16px',
                    borderRadius: isAi ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
                    backgroundColor: isAi ? '#ffffff' : '#0284c7',
                    color: isAi ? '#1e293b' : '#ffffff',
                    boxShadow: isAi ? '0 2px 6px rgba(0,0,0,0.05)' : '0 2px 6px rgba(2,132,199,0.25)',
                    border: isAi ? '1px solid #e2e8f0' : 'none',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    whiteSpace: 'pre-line',
                  }}
                >
                  {msg.text}
                  {msg.verified && (
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '6px 10px',
                        background: '#dcfce7',
                        color: '#15803d',
                        borderRadius: '8px',
                        fontWeight: 700,
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <i className="fas fa-check-circle"></i>
                      <span>Score: {msg.score}% — Verified! Logging in...</span>
                    </div>
                  )}
                  {msg.failed && (
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '6px 10px',
                        background: '#fee2e2',
                        color: '#b91c1c',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '12px',
                      }}
                    >
                      Score: {msg.score}% (Requires 90%)
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: '10px',
                      marginTop: '4px',
                      opacity: 0.65,
                      textAlign: isAi ? 'left' : 'right',
                    }}
                  >
                    {msg.time}
                  </div>
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: '#0284c7',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                }}
              >
                <i className="fas fa-robot"></i>
              </div>
              <div
                style={{
                  padding: '10px 16px',
                  borderRadius: '16px 16px 16px 4px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  color: '#64748b',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }}></span>
                <span>Izumi is checking records...</span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Bar or Retry View */}
        {verificationResult && !verificationResult.verified ? (
          <div style={{ padding: '16px', background: '#ffffff', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px' }}>
            <button
              onClick={startSession}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '10px',
                border: 'none',
                background: '#0284c7',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              <i className="fas fa-redo" style={{ marginRight: '6px' }}></i> Try Again
            </button>
            <button
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Use Standard OTP
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSendMessage}
            style={{
              padding: '12px 16px',
              background: '#ffffff',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type your answer here..."
              disabled={loading || isTyping || (verificationResult && verificationResult.verified)}
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                outline: 'none',
                backgroundColor: '#ffffff',
              }}
            />
            <button
              type="submit"
              disabled={!inputText.trim() || loading || isTyping}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                border: 'none',
                background: inputText.trim() ? '#0284c7' : '#94a3b8',
                color: '#ffffff',
                fontSize: '16px',
                cursor: inputText.trim() ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s',
              }}
            >
              <i className="fas fa-paper-plane"></i>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
