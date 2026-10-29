import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

export default function Community() {
  const { customer } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bannerMsg, setBannerMsg] = useState(null);
  
  // Post form state
  const [isPosting, setIsPosting] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [location, setLocation] = useState('');
  const [postType, setPostType] = useState('sos'); // 'sos' default first
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Post Detail & Comments Modal state
  const [selectedPost, setSelectedPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const res = await api.get('/community/posts');
      if (res.data.success) {
        setPosts(res.data.data.posts || []);
      }
    } catch (error) {
      console.error('Failed to fetch posts', error);
    } finally {
      setLoading(false);
    }
  };

  const openPostDetail = async (post) => {
    setSelectedPost(post);
    setComments([]);
    setLoadingComments(true);
    try {
      const res = await api.get(`/community/posts/${post.id}/comments`);
      if (res.data.success) {
        setComments(res.data.data.comments || []);
      }
    } catch (error) {
      console.error('Failed to load comments', error);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedPost) return;

    setSubmittingComment(true);
    try {
      const res = await api.post('/community/comments', {
        post_id: selectedPost.id,
        body: newComment.trim(),
      });
      if (res.data.success && res.data.data?.comment) {
        const added = res.data.data.comment;
        setComments((prev) => [...prev, added]);
        setNewComment('');
        setPosts((prev) =>
          prev.map((p) =>
            p.id === selectedPost.id
              ? { ...p, comment_count: Number(p.comment_count || 0) + 1 }
              : p
          )
        );
        setSelectedPost((prev) =>
          prev ? { ...prev, comment_count: Number(prev.comment_count || 0) + 1 } : null
        );
      }
    } catch (error) {
      console.error('Failed to post comment', error);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleResolvePost = async (postId) => {
    try {
      const res = await api.put(`/community/posts/${postId}/resolve`);
      if (res.data.success) {
        setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, status: 'resolved' } : p)));
        setSelectedPost((prev) => (prev && prev.id === postId ? { ...prev, status: 'resolved' } : prev));
        setBannerMsg({ type: 'success', text: 'MASKPRO S.O.S. marked as resolved.' });
        setTimeout(() => setBannerMsg(null), 4000);
      }
    } catch (error) {
      console.error('Resolve error:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await api.post('/community/posts', {
        type: postType,
        title: title.trim(),
        body: body.trim(),
        location: postType === 'sos' ? location.trim() : null,
      });
      if (res.data.success) {
        setBannerMsg({
          type: postType === 'sos' ? 'sos' : 'info',
          text:
            postType === 'sos'
              ? 'MASKPRO S.O.S. is now live! Community members and technicians have been notified.'
              : 'Discussion submitted! Your post is pending admin approval before appearing in the public feed.',
        });
        setTimeout(() => setBannerMsg(null), 6000);
        setTitle('');
        setBody('');
        setLocation('');
        setIsPosting(false);
        fetchPosts();
      }
    } catch (error) {
      console.error('Submit error:', error);
      setBannerMsg({ type: 'error', text: 'Failed to submit post. Please try again.' });
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
      <div style={{ padding: 'clamp(4px, 2vw, 24px)', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
          <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => setIsPosting(false)}>Community Care</span>
          <span style={{ margin: '0 8px' }}>/</span>
          <span>Create Post</span>
        </div>

        <div style={{
          background: 'white', borderRadius: '16px', padding: 'clamp(16px, 4vw, 32px)',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.06)', border: '1px solid #e2e8f0'
        }}>
          <h2 style={{ margin: '0 0 20px', fontSize: 'clamp(20px, 4.5vw, 24px)', color: '#1e293b', fontWeight: 700 }}>Create a Post</h2>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setPostType('sos')}
              style={{
                flex: 1, minWidth: '180px', padding: '16px', borderRadius: '12px', border: '2px solid',
                borderColor: postType === 'sos' ? '#ef4444' : '#e2e8f0',
                background: postType === 'sos' ? '#fef2f2' : 'white',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                fontFamily: 'inherit', whiteSpace: 'nowrap'
              }}
            >
              <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: '22px', color: postType === 'sos' ? '#ef4444' : '#64748b' }}></i>
              <span style={{ fontWeight: 700, color: postType === 'sos' ? '#b91c1c' : '#475569' }}>MASKPRO S.O.S.</span>
            </button>
            <button
              type="button"
              onClick={() => setPostType('discussion')}
              style={{
                flex: 1, minWidth: '180px', padding: '16px', borderRadius: '12px', border: '2px solid',
                borderColor: postType === 'discussion' ? '#2563eb' : '#e2e8f0',
                background: postType === 'discussion' ? '#eff6ff' : 'white',
                cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                fontFamily: 'inherit', whiteSpace: 'nowrap'
              }}
            >
              <i className="bi bi-chat-text-fill" style={{ fontSize: '22px', color: postType === 'discussion' ? '#2563eb' : '#64748b' }}></i>
              <span style={{ fontWeight: 700, color: postType === 'discussion' ? '#1e40af' : '#475569' }}>Maintenance Discussion</span>
            </button>
          </div>

          <div style={{
            marginBottom: '20px', padding: '10px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 500,
            background: postType === 'sos' ? '#fef2f2' : '#fffbeb',
            color: postType === 'sos' ? '#991b1b' : '#92400e',
            border: postType === 'sos' ? '1px solid #fecaca' : '1px solid #fde68a',
            display: 'flex', alignItems: 'center', gap: '8px'
          }}>
            <i className={`bi ${postType === 'sos' ? 'bi-broadcast' : 'bi-shield-check'}`}></i>
            <span>
              {postType === 'sos'
                ? 'Publishes immediately and sends an emergency push alert to nearby members.'
                : 'Moderated community feed: Posts require admin approval before going public.'}
            </span>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#334155', fontSize: '14px' }}>Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={postType === 'sos' ? "E.g. Flat tire at J.P. Laurel Bajada, Davao, need help!" : "E.g. How to maintain my Nano Ceramic Coating?"}
                style={{
                  width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #cbd5e1',
                  fontSize: '15px', fontFamily: 'inherit'
                }}
              />
            </div>

            {postType === 'sos' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#334155', fontSize: '14px' }}>Current Location (Optional)</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="E.g. SM Lanang Premier parking, Davao City"
                  style={{
                    width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #cbd5e1',
                    fontSize: '15px', fontFamily: 'inherit'
                  }}
                />
              </div>
            )}

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#334155', fontSize: '14px' }}>Details</label>
              <textarea
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                placeholder={
                  postType === 'sos' 
                  ? "Guide: Where are you? What is your car model? What is the issue?\n\nExample: My car battery died at SM Lanang Premier parking. I drive a Toyota Fortuner. Can any techs or members nearby help?"
                  : "Share or ask about maintenance tips for your coating, tint, or PPF. Note: For service issues, please contact support directly."
                }
                style={{
                  width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #cbd5e1',
                  fontSize: '15px', resize: 'vertical', fontFamily: 'inherit'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setIsPosting(false)}
                style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: '#f1f5f9', color: '#475569', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                style={{ 
                  padding: '10px 24px', borderRadius: '10px', border: 'none', 
                  background: postType === 'sos' ? '#ef4444' : '#2563eb', 
                  color: 'white', fontWeight: 700, cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.7 : 1, fontFamily: 'inherit', whiteSpace: 'nowrap'
                }}
              >
                {isSubmitting ? 'Submitting...' : postType === 'sos' ? 'Broadcast S.O.S.' : 'Submit for Approval'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 'clamp(4px, 2vw, 24px)', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="bi bi-people-fill" style={{ color: '#2563eb' }}></i>
            Community Care
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
            Roadside S.O.S. alerts and moderated maintenance discussions
          </p>
        </div>
        <button
          onClick={() => { setPostType('sos'); setIsPosting(true); }}
          style={{
            background: '#2563eb', color: 'white', border: 'none', borderRadius: '10px',
            padding: '10px 20px', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 10px rgba(37, 99, 235, 0.22)',
            fontFamily: 'inherit', whiteSpace: 'nowrap'
          }}
        >
          <i className="bi bi-pencil-square"></i> Create Post
        </button>
      </div>

      {bannerMsg && (
        <div style={{
          marginBottom: '16px', padding: '12px 16px', borderRadius: '12px', fontSize: '13.5px', fontWeight: 600,
          background: bannerMsg.type === 'sos' ? '#fef2f2' : bannerMsg.type === 'error' ? '#fef2f2' : '#eff6ff',
          color: bannerMsg.type === 'sos' || bannerMsg.type === 'error' ? '#b91c1c' : '#1e40af',
          border: `1px solid ${bannerMsg.type === 'sos' || bannerMsg.type === 'error' ? '#fecaca' : '#bfdbfe'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px'
        }}>
          <span>{bannerMsg.text}</span>
          <button onClick={() => setBannerMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '16px' }}>
            <i className="bi bi-x"></i>
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Loading posts...</div>
      ) : posts.length === 0 ? (
        <div style={{
          background: 'white', borderRadius: '16px', padding: '48px 20px', textAlign: 'center',
          border: '1px dashed #cbd5e1'
        }}>
          <i className="bi bi-chat-quote" style={{ fontSize: '48px', color: '#94a3b8', marginBottom: '16px', display: 'block' }}></i>
          <h3 style={{ margin: '0 0 8px', color: '#1e293b' }}>No posts yet</h3>
          <p style={{ margin: 0, color: '#64748b' }}>Be the first to start a discussion or broadcast an S.O.S.!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {posts.map(post => {
            const isSos = post.type === 'sos';
            const isPending = post.moderation_status === 'pending';
            const isResolved = post.status === 'resolved';
            return (
              <div
                key={post.id}
                onClick={() => openPostDetail(post)}
                style={{
                  background: isSos && !isResolved ? '#fffafa' : 'white',
                  borderRadius: '16px', padding: '20px', cursor: 'pointer',
                  border: isSos && !isResolved ? '2px solid #fecaca' : isPending ? '1.5px dashed #f59e0b' : '1px solid #e2e8f0',
                  boxShadow: isSos && !isResolved ? '0 4px 14px rgba(239, 68, 68, 0.1)' : '0 2px 6px rgba(0,0,0,0.03)',
                  position: 'relative', overflow: 'hidden', transition: 'transform 0.15s ease'
                }}
              >
                {isSos && (
                  <div style={{
                    position: 'absolute', top: 0, right: 0,
                    background: isResolved ? '#10b981' : '#ef4444', color: 'white',
                    fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderBottomLeftRadius: '12px',
                    letterSpacing: '0.6px'
                  }}>
                    {isResolved ? 'S.O.S. RESOLVED' : 'MASKPRO S.O.S.'}
                  </div>
                )}

                {isPending && (
                  <div style={{
                    position: 'absolute', top: 0, right: 0,
                    background: '#f59e0b', color: 'white',
                    fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderBottomLeftRadius: '12px',
                  }}>
                    Pending Approval
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: '14px' }}>
                  <div style={{ flexShrink: 0 }}>
                    {post.author_photo ? (
                      <img src={`${import.meta.env.VITE_API_URL || ''}/api/uploads/photos/${post.author_photo}`} alt="" style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#e2e8f0', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                        {post.author_name ? post.author_name.charAt(0).toUpperCase() : 'U'}
                      </div>
                    )}
                  </div>
                  
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px', flexWrap: 'wrap', paddingRight: '110px' }}>
                      <span style={{ fontWeight: 700, color: '#1e293b' }}>{post.author_name}</span>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>{timeAgo(post.created_at)}</span>
                    </div>
                    
                    <h4 style={{ margin: '0 0 8px', fontSize: '17px', color: '#0f172a', fontWeight: 700 }}>
                      {post.title}
                    </h4>

                    {post.location && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, color: '#dc2626', background: '#fef2f2', padding: '3px 10px', borderRadius: '8px', marginBottom: '8px' }}>
                        <i className="bi bi-geo-alt-fill"></i>
                        <span>{post.location}</span>
                      </div>
                    )}
                    
                    <p style={{ margin: '0 0 16px', color: '#475569', lineHeight: 1.5, whiteSpace: 'pre-wrap', fontSize: '14.5px' }}>
                      {post.body}
                    </p>
                    
                    <div style={{ display: 'flex', gap: '16px', borderTop: '1px solid #f1f5f9', paddingTop: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openPostDetail(post); }}
                        style={{ background: 'none', border: 'none', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                      >
                        <i className="bi bi-chat-dots"></i>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{post.comment_count || 0} Comments</span>
                      </button>
                      {isSos && !isResolved && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openPostDetail(post); }}
                          style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', padding: '5px 12px', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                        >
                          <i className="bi bi-life-preserver"></i>
                          <span style={{ fontSize: '13px', fontWeight: 700 }}>Offer Help / Comment</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Post Detail & Comments Modal ─────────────────────────── */}
      {selectedPost && (
        <div
          onClick={() => setSelectedPost(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(4px)', zIndex: 1300,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: '20px', width: '100%', maxWidth: '640px',
              maxHeight: '88vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 24px 60px rgba(0,0,0,0.22)', overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: selectedPost.type === 'sos' ? '#fef2f2' : '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i
                  className={`bi ${selectedPost.type === 'sos' ? 'bi-exclamation-triangle-fill' : 'bi-chat-text-fill'}`}
                  style={{ color: selectedPost.type === 'sos' ? '#dc2626' : '#2563eb', fontSize: '16px' }}
                ></i>
                <span style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>
                  {selectedPost.type === 'sos' ? 'MASKPRO S.O.S. Thread' : 'Discussion Thread'}
                </span>
              </div>
              <button
                onClick={() => setSelectedPost(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#64748b', cursor: 'pointer' }}
              >
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            {/* Modal Body: Post + Comments */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              <div style={{ paddingBottom: '16px', borderBottom: '1px solid #e2e8f0', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '18px' }}>{selectedPost.title}</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                      Posted by <strong>{selectedPost.author_name}</strong> • {timeAgo(selectedPost.created_at)}
                    </div>
                  </div>
                  {selectedPost.type === 'sos' && selectedPost.status === 'open' && customer?.id === selectedPost.customer_id && (
                    <button
                      onClick={() => handleResolvePost(selectedPost.id)}
                      style={{
                        background: '#10b981', color: 'white', border: 'none', borderRadius: '8px',
                        padding: '6px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                        whiteSpace: 'nowrap', fontFamily: 'inherit'
                      }}
                    >
                      <i className="bi bi-check-circle" style={{ marginRight: '4px' }}></i>
                      Mark Resolved
                    </button>
                  )}
                </div>

                {selectedPost.location && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, color: '#dc2626', background: '#fef2f2', padding: '4px 10px', borderRadius: '8px', marginBottom: '10px' }}>
                    <i className="bi bi-geo-alt-fill"></i>
                    <span>{selectedPost.location}</span>
                  </div>
                )}

                <p style={{ margin: 0, color: '#334155', lineHeight: 1.55, whiteSpace: 'pre-wrap', fontSize: '14.5px' }}>
                  {selectedPost.body}
                </p>
              </div>

              <div style={{ fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '12px' }}>
                Comments ({comments.length})
              </div>

              {loadingComments ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Loading comments...</div>
              ) : comments.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '12px', fontSize: '13px' }}>
                  No comments yet. Be the first to respond!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {comments.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        padding: '12px 14px', borderRadius: '12px',
                        background: c.is_tech ? '#eff6ff' : '#f8fafc',
                        border: c.is_tech ? '1px solid #bfdbfe' : '1px solid #f1f5f9'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>{c.author_name}</span>
                          {Boolean(c.is_tech) && (
                            <span style={{
                              background: '#2563eb', color: 'white', fontSize: '10px', fontWeight: 700,
                              padding: '2px 7px', borderRadius: '6px'
                            }}>
                              MaskPro Tech
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{timeAgo(c.created_at)}</span>
                      </div>
                      <div style={{ fontSize: '13.5px', color: '#334155', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                        {c.body}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer: Add Comment */}
            <form
              onSubmit={handleAddComment}
              style={{
                padding: '12px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
                display: 'flex', gap: '10px', alignItems: 'center'
              }}
            >
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={selectedPost.type === 'sos' ? 'Write an S.O.S. response or offer help...' : 'Write a comment...'}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: '10px',
                  border: '1px solid #cbd5e1', fontSize: '14px', fontFamily: 'inherit', background: 'white'
                }}
              />
              <button
                type="submit"
                disabled={submittingComment || !newComment.trim()}
                style={{
                  background: selectedPost.type === 'sos' ? '#dc2626' : '#2563eb',
                  color: 'white', border: 'none', borderRadius: '10px',
                  padding: '10px 18px', fontSize: '13px', fontWeight: 700,
                  cursor: submittingComment || !newComment.trim() ? 'not-allowed' : 'pointer',
                  opacity: submittingComment || !newComment.trim() ? 0.6 : 1,
                  fontFamily: 'inherit', whiteSpace: 'nowrap'
                }}
              >
                {submittingComment ? 'Sending...' : 'Send'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
