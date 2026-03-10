<?php
// Check if user is logged in
if (isset($_SESSION['customer_id'])) {
?>
    </div> <!-- Close container -->
</div> <!-- Close main content -->
<?php } else { ?>
    </div>
<?php } ?>

<!-- Bootstrap JS Bundle with Popper -->
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js"></script>
<!-- jQuery -->
<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>

<!-- Custom JavaScript -->
<script>
    // Mobile menu toggle function
    function toggleMobileMenu() {
        const mobileMenu = document.getElementById('mobileMenu');
        const isOpen = !mobileMenu.classList.contains('hidden');
        
        if (isOpen) {
            mobileMenu.classList.add('hidden');
        } else {
            mobileMenu.classList.remove('hidden');
        }
    }
    
    // Close mobile menu when clicking outside
    document.addEventListener('click', function(event) {
        const mobileMenu = document.getElementById('mobileMenu');
        const menuToggle = document.querySelector('.mobile-menu-toggle');
        
        if (mobileMenu && menuToggle && 
            !mobileMenu.contains(event.target) && 
            !menuToggle.contains(event.target)) {
            mobileMenu.classList.add('hidden');
        }
    });
    
    // Initialize page functionality
    document.addEventListener('DOMContentLoaded', function() {
        // Initialize tooltips if Bootstrap is available
        if (typeof bootstrap !== 'undefined') {
            var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
            var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
                return new bootstrap.Tooltip(tooltipTriggerEl);
            });
        }
        
        // Sidebar toggle functionality
        const sidebarToggle = document.querySelector('.toggle-sidebar-btn');
        const body = document.body;
        
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', function() {
                body.classList.toggle('toggle-sidebar');
                
                // Add/remove mobile overlay for mobile devices
                if (window.innerWidth < 1200) {
                    if (body.classList.contains('toggle-sidebar')) {
                        // Create and add overlay
                        const overlay = document.createElement('div');
                        overlay.className = 'sidebar-overlay';
                        overlay.style.cssText = `
                            position: fixed;
                            top: 0;
                            left: 0;
                            width: 100%;
                            height: 100%;
                            background: rgba(0, 0, 0, 0.5);
                            z-index: 995;
                            transition: opacity 0.3s ease;
                        `;
                        document.body.appendChild(overlay);
                        
                        // Close sidebar when clicking overlay
                        overlay.addEventListener('click', function() {
                            body.classList.remove('toggle-sidebar');
                            overlay.remove();
                        });
                    } else {
                        // Remove overlay
                        const overlay = document.querySelector('.sidebar-overlay');
                        if (overlay) {
                            overlay.remove();
                        }
                    }
                }
            });
        }
        
        // Close sidebar on window resize if mobile overlay is active
        window.addEventListener('resize', function() {
            if (window.innerWidth >= 1200) {
                const overlay = document.querySelector('.sidebar-overlay');
                if (overlay) {
                    overlay.remove();
                }
            }
        });
        
        // Search bar toggle for mobile
        const searchToggle = document.querySelector('.search-bar-toggle');
        const searchBar = document.querySelector('.search-bar');
        
        if (searchToggle && searchBar) {
            searchToggle.addEventListener('click', function() {
                searchBar.classList.toggle('search-bar-show');
            });
        }
        
        console.log('MASKPROCare App loaded successfully!');
        
        // Smooth scrolling for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
        
        // Add loading states to submit buttons
        document.querySelectorAll('form').forEach(form => {
            form.addEventListener('submit', function() {
                const submitBtn = this.querySelector('button[type="submit"], input[type="submit"]');
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
                }
            });
        });
        
        // Close mobile menu on window resize
        window.addEventListener('resize', function() {
            const mobileMenu = document.getElementById('mobileMenu');
            if (window.innerWidth > 768 && mobileMenu) {
                mobileMenu.classList.add('hidden');
            }
        });
    });
</script>

</body>
</html>