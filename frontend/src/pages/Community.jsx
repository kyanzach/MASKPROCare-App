import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function Community() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Post form state
  const [isPosting, setIsPosting] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [postType, setPostType] = useState('sos'); // 'sos' or 'discussion'
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const res = await api.get('/community/posts');
      if (res.data.success) {
        setPosts(res.data.data.posts);
      }
    } catch (error) {
      console.error('Failed to fetch posts', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await api.post('/community/posts', {
        type: postType,
        title,
        body
      });
      if (res.data.success) {
        alert(postType === 'sos' ? 'Your MASKPRO S.O.S. request was submitted instantly!' : 'Your post has been submitted.');
        setTitle('');
        setBody('');
        setIsPosting(false);
        fetchPosts();
      }
    } catch (error) {
      console.error('Submit error:', error);
      alert('Failed to submit post. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const timeAgo = (dateStr) => {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (isPosting) {
    return (
      <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
          <span style={{ cursor: 'pointer', color: '#3b82f6' }} onClick={() => setIsPosting(false)}>Community Care</span>
          <span style={{ margin: '0 8px' }}>/</span>
          <span>Create Post</span>
        </div>

        <div style={{
          background: 'white', borderRadius: '16px', padding: '32px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
        }}>
          <h2 style={{ margin: '0 0 24px', fontSize: '24px', color: '#1e293b' }}>Create a New Post</h2>

          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
            <button
              onClick={() => setPostType('sos')}
              style={{
                flex: 1, padding: '16px', borderRadius: '12px', border: '2px solid',
                borderColor: postType === 'sos' ? '#ef4444' : '#e2e8f0',
                background: postType === 'sos' ? '#fef2f2' : 'white',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px'
              }}
            >
              <i className="bi bi-exclamation-triangle" style={{ fontSize: '24px', color: postType === 'sos' ? '#ef4444' : '#64748b' }}></i>
              <span style={{ fontWeight: 600, color: postType === 'sos' ? '#b91c1c' : '#475569' }}>MASKPRO S.O.S.</span>
            </button>
            <button
              onClick={() => setPostType('discussion')}
              style={{
                flex: 1, padding: '16px', borderRadius: '12px', border: '2px solid',
                borderColor: postType === 'discussion' ? '#3b82f6' : '#e2e8f0',
                background: postType === 'discussion' ? '#eff6ff' : 'white',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px'
              }}
            >
              <i className="bi bi-chat-text" style={{ fontSize: '24px', color: postType === 'discussion' ? '#3b82f6' : '#64748b' }}></i>
              <span style={{ fontWeight: 600, color: postType === 'discussion' ? '#1e40af' : '#475569' }}>Maintenance Discussion</span>
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#334155' }}>Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={postType === 'sos' ? "E.g. Flat tire at EDSA Ayala, need help!" : "E.g. How to maintain my Nano Ceramic Coating?"}
                style={{
                  width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                  fontSize: '15px'
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#334155' }}>Details</label>
              <textarea
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={6}
                placeholder={
                  postType === 'sos' 
                  ? "Guide: Where are you? What is your car model? What is the issue?\n\nExample: My car battery died at SM Megamall parking. I drive a Toyota Fortuner. Can any techs or members nearby help?"
                  : "Share or ask about maintenance tips for your coating, tint, or PPF. Note: For service issues, please contact support directly."
                }
                style={{
                  width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                  fontSize: '15px', resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setIsPosting(false)}
                style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#f1f5f9', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{ 
                  padding: '10px 24px', borderRadius: '8px', border: 'none', 
                  background: postType === 'sos' ? '#ef4444' : '#3b82f6', 
                  color: 'white', fontWeight: 600, cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.7 : 1
                }}
              >
                {isSubmitting ? 'Publishing...' : 'Publish Post'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <i className="bi bi-people" style={{ color: '#4f46e5' }}></i>
          Community Care
        </h2>
        <button
          onClick={() => setIsPosting(true)}
          style={{
            background: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px',
            padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 6px rgba(79, 70, 229, 0.2)'
          }}
        >
          <i className="bi bi-pencil-square"></i> Create Post
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading posts...</div>
      ) : posts.length === 0 ? (
        <div style={{
          background: 'white', borderRadius: '16px', padding: '48px 20px', textAlign: 'center',
          border: '1px dashed #cbd5e1'
        }}>
          <i className="bi bi-chat-quote" style={{ fontSize: '48px', color: '#94a3b8', marginBottom: '16px', display: 'block' }}></i>
          <h3 style={{ margin: '0 0 8px', color: '#1e293b' }}>No posts yet</h3>
          <p style={{ margin: 0, color: '#64748b' }}>Be the first to start a discussion or ask for help!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {posts.map(post => (
            <div key={post.id} style={{
              background: 'white', borderRadius: '16px', padding: '20px',
              border: post.type === 'sos' ? '2px solid #fecaca' : '1px solid #e2e8f0',
              boxShadow: post.type === 'sos' ? '0 4px 12px rgba(239, 68, 68, 0.1)' : '0 2px 4px rgba(0,0,0,0.02)',
              position: 'relative', overflow: 'hidden'
            }}>
              {post.type === 'sos' && (
                <div style={{
                  position: 'absolute', top: 0, right: 0, background: '#ef4444', color: 'white',
                  fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderBottomLeftRadius: '12px',
                  letterSpacing: '1px'
                }}>
                  MASKPRO S.O.S.
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flexShrink: 0 }}>
                  {post.author_photo ? (
                    <img src={`${import.meta.env.VITE_API_URL || ''}/api/uploads/photos/${post.author_photo}`} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e2e8f0', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                      {post.author_name ? post.author_name.charAt(0).toUpperCase() : 'U'}
                    </div>
                  )}
                </div>
                
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{post.author_name}</span>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>{timeAgo(post.created_at)}</span>
                  </div>
                  
                  <h4 style={{ margin: '0 0 8px', fontSize: '18px', color: '#0f172a', fontWeight: 700 }}>
                    {post.title}
                  </h4>
                  
                  <p style={{ margin: '0 0 16px', color: '#475569', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {post.body}
                  </p>
                  
                  <div style={{ display: 'flex', gap: '16px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                    <button style={{ background: 'none', border: 'none', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: 0 }}>
                      <i className="bi bi-chat"></i>
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>{post.comment_count || 0} Comments</span>
                    </button>
                    {post.type === 'sos' && post.status === 'open' && (
                      <button style={{ background: 'none', border: 'none', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: 0 }}>
                        <i className="bi bi-life-preserver"></i>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>Offer Help</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
