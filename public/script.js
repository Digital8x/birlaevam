/* ═══════════════════════════════════════════════
   BIRLA EVAM — Core Client Controller
   ═══════════════════════════════════════════════ */

// ─── Tracking Variables ──────────────────────────
let trackingData = { device: '', browser: '', ip: '', city: '', country: '' };

function detectDevice() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'Android Mobile';
  if (/iPhone/i.test(ua)) return 'iPhone Mobile';
  if (/iPad/i.test(ua)) return 'iPad Tablet';
  if (/Mac/i.test(navigator.platform)) return 'Mac Desktop';
  if (/Win/i.test(navigator.platform)) return 'Windows Desktop';
  return 'Desktop';
}

function detectBrowser() {
  const ua = navigator.userAgent;
  if (ua.indexOf('Edg') > -1) return 'Edge';
  if (ua.indexOf('Chrome') > -1) return 'Chrome';
  if (ua.indexOf('Firefox') > -1) return 'Firefox';
  if (ua.indexOf('Safari') > -1) return 'Safari';
  return 'Chrome';
}

function getQueryParam(key) {
  return new URLSearchParams(window.location.search).get(key) || '';
}

async function initTracking() {
  // Capture UTM details
  const src = getQueryParam('utm_source');
  const med = getQueryParam('utm_medium');
  if (src) sessionStorage.setItem('utm_source', src);
  if (med) sessionStorage.setItem('utm_medium', med);

  trackingData.device = detectDevice();
  trackingData.browser = detectBrowser();

  try {
    const res = await fetch('https://ipapi.co/json/');
    const data = await res.json();
    trackingData.ip = data.ip || '';
    trackingData.city = data.city || '';
    trackingData.country = data.country_name || '';
  } catch (e) {
    try {
      const res2 = await fetch('https://get.geojs.io/v1/ip/geo.json');
      const data2 = await res2.json();
      trackingData.ip = data2.ip || '';
      trackingData.city = data2.city || '';
      trackingData.country = data2.country || '';
    } catch(err) { console.log('Client tracking geolocation skipped'); }
  }
}

// ─── Header Scroll & Hamburger Toggler ───────────
function initHeader() {
  const hamburger = document.getElementById('hamburger');
  const nav = document.getElementById('mainNav');
  const header = document.getElementById('header');

  if (header) {
    window.addEventListener('scroll', () => {
      // 1. Header scroll visual state transitions
      if (window.scrollY > 50) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }

      // 2. 100% Authentic Homy-Style 3D Sticky Zoom Track calculations
      const heroTrack = document.getElementById('heroTrack');
      const buildingLayer = document.querySelector('.hero__building-layer');
      const heroContent = document.querySelector('.hero__content');

      if (heroTrack && buildingLayer) {
        const rect = heroTrack.getBoundingClientRect();
        const scrollableHeight = rect.height - window.innerHeight;

        if (scrollableHeight > 0) {
          // Compute scroll progress through the track (0.0 to 1.0)
          let progress = -rect.top / scrollableHeight;
          progress = Math.max(0, Math.min(1, progress));

          // Homy-Style 3D Zoom: building scales from 0.7 to 1.2
          const buildingScale = 0.7 + (progress * 0.5); 
          // Translate building up on scroll while keeping bottom edge safe under the viewport boundary
          const buildingTranslateY = progress * -240;

          // Keep absolute left-center anchor using translateX(-50%)
          buildingLayer.style.transform = `translateX(-50%) translateY(${buildingTranslateY}px) scale(${buildingScale})`;

          // Text content scales up (1.0 to 1.4) and fades out completely (flies off screen in 3D space)
          if (heroContent) {
            const textScale = 1.0 + (progress * 0.4);
            const textTranslateY = progress * -180;
            const textOpacity = Math.max(0, 1 - (progress * 1.25)); // Fade out fully before building rises high
            
            heroContent.style.opacity = textOpacity;
            heroContent.style.transform = `translateY(${textTranslateY}px) scale(${textScale})`;
            
            // Dynamically lower z-index when scrolling to allow the text to transition behind the rising building cutout (z-index 10)
            if (progress > 0.02) {
              heroContent.style.zIndex = '3';
            } else {
              heroContent.style.zIndex = '15';
            }
          }
        }
      }
    });
  }

  if (hamburger && nav) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('active');
      nav.classList.toggle('open');
    });
    
    nav.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        hamburger.classList.remove('active');
        nav.classList.remove('open');
        
        // Mark active
        nav.querySelectorAll('a').forEach(lnk => lnk.classList.remove('active'));
        a.classList.add('active');
      });
    });
  }
}

// ─── FAQ Accordion ───────────────────────────────
function initFAQs() {
  document.querySelectorAll('.faq-item__q').forEach(q => {
    q.addEventListener('click', () => {
      const item = q.parentElement;
      const wasActive = item.classList.contains('active');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
      if (!wasActive) item.classList.add('active');
    });
  });
}

// ─── Floor Plan Tab Switcher ──────────────────────
function initFloorPlanTabs() {
  const tabs = document.querySelectorAll('.floorplan__tab-btn');
  const panes = document.querySelectorAll('.floorplan__content-pane');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-target');
      
      tabs.forEach(t => t.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));
      
      tab.classList.add('active');
      const pane = document.getElementById(target);
      if (pane) pane.classList.add('active');
    });
  });
}

// ─── Popup Card & Brochure Gate ──────────────────
function showLeadPopup(source) {
  const popup = document.getElementById('leadPopup');
  const title = document.getElementById('popupTitle');
  const subtitle = document.getElementById('popupSubtitle');
  const btn = document.getElementById('popupButton');
  const sourceField = document.getElementById('formSource');

  if (popup) {
    popup.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  if (sourceField) {
    sourceField.value = source || 'General Enquiry';
  }

  if (title && subtitle && btn) {
    if (source.includes('Brochure') || source.includes('Download')) {
      title.innerHTML = 'Download <i>Brochure</i>';
      subtitle.textContent = 'Please enter your details to receive the comprehensive e-brochure & detailed cost sheets.';
      btn.textContent = 'Download & View Brochure';
    } else if (source.includes('Floorplan') || source.includes('BHK')) {
      title.innerHTML = 'Request <i>Floor Plan</i>';
      subtitle.textContent = 'Enter your details to receive high-resolution layout configurations & exact carpet calculations.';
      btn.textContent = 'Request Floor Plan details';
    } else if (source.includes('Visit') || source.includes('Schedule')) {
      title.innerHTML = 'Book <i>Site Visit</i>';
      subtitle.textContent = 'Schedule a secure VIP private site tour at Manjri. Free pickup & drop included.';
      btn.textContent = 'Schedule Site Visit';
    } else {
      title.innerHTML = 'Premium <i>VIP Access</i>';
      subtitle.textContent = 'Share your contact details to connect directly with our authorized relationship manager.';
      btn.textContent = 'Request Callback';
    }
  }
}

function hideLeadPopup() {
  const popup = document.getElementById('leadPopup');
  if (popup) {
    popup.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function initPopup() {
  const close = document.querySelector('.lead-popup__close');
  if (close) close.addEventListener('click', hideLeadPopup);
  const popup = document.getElementById('leadPopup');
  if (popup) {
    popup.addEventListener('click', (e) => { if (e.target === popup) hideLeadPopup(); });
  }
}

// ─── intl-tel-input Phone Dropdown ────────────────
let phoneInputs = [];
function initPhoneInputs() {
  document.querySelectorAll('input[type="tel"]').forEach(input => {
    const iti = window.intlTelInput(input, {
      initialCountry: "auto",
      geoIpLookup: function(success, failure) {
        fetch("https://ipapi.co/json/")
          .then(res => res.json())
          .then(data => success(data.country_code))
          .catch(() => success("in"));
      },
      utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/18.2.1/js/utils.js",
      separateDialCode: true
    });
    phoneInputs.push({ input, iti });
  });
}

// ─── Lead Form Submission REST Interceptor ───────
function initLeadForms() {
  document.querySelectorAll('.lead-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const origText = btn.textContent;
      btn.textContent = 'Verifying & Submitting...';
      btn.disabled = true;

      const formData = new FormData(form);
      const email = formData.get('email') || '';

      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          showToast('Please enter a valid email address.', 'error');
          btn.textContent = origText;
          btn.disabled = false;
          return;
        }
      }

      const phoneInput = form.querySelector('input[type="tel"]');
      const phoneObj = phoneInputs.find(p => p.input === phoneInput);
      if (phoneObj && !phoneObj.iti.isValidNumber()) {
        showToast('Please enter a valid phone number (10 digits & correct country dial).', 'error');
        btn.textContent = origText;
        btn.disabled = false;
        return;
      }

      const payload = {
        name: formData.get('name'),
        phone: phoneObj ? phoneObj.iti.getNumber() : formData.get('phone'),
        email: email,
        source_button: formData.get('source_button') || 'General Enquiry',
        project: 'Birla Evam Manjri',
        refer_url: document.referrer || window.location.href,
        device: trackingData.device,
        browser: trackingData.browser,
        ip_address: trackingData.ip,
        city: trackingData.city,
        country: trackingData.country,
        utm_source: sessionStorage.getItem('utm_source') || getQueryParam('utm_source') || '',
        utm_medium: sessionStorage.getItem('utm_medium') || getQueryParam('utm_medium') || ''
      };

      try {
        const res = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          window.location.href = '/thank-you.html';
        } else {
          showToast(data.message || 'Verification failed. Please try again.', 'error');
        }
      } catch (err) {
        showToast('Submission error. Please verify your connection & try again.', 'error');
      }
      btn.textContent = origText;
      btn.disabled = false;
    });
  });
}

// ─── Toast Notifications ────────────────────────
function showToast(msg, type) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = 'toast ' + (type || '');
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => toast.classList.remove('show'), 4000);
}

// ─── Gallery Lightbox Modal ──────────────────────
function initLightbox() {
  const items = document.querySelectorAll('.gallery__item, #masterplanTrigger');
  if (!items.length) return;

  let lightbox = document.getElementById('lightbox');
  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.id = 'lightbox';
    lightbox.className = 'lightbox';
    lightbox.innerHTML = '<button class="lightbox__close">&times;</button><img src="" alt="Preview">';
    document.body.appendChild(lightbox);
  }

  items.forEach(item => {
    item.addEventListener('click', () => {
      const imgDiv = item.querySelector('.secure-image');
      if (imgDiv) {
        const style = imgDiv.style.backgroundImage;
        // Extract URL
        const url = style.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
        lightbox.querySelector('img').src = url;
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    });
  });

  lightbox.querySelector('.lightbox__close').addEventListener('click', () => {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  });
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) {
      lightbox.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
}

// ─── Active Nav Highlighting on Scroll ───────────
function initActiveNavHighlight() {
  const sections = document.querySelectorAll('section[id]');
  window.addEventListener('scroll', () => {
    let scrollY = window.pageYOffset;
    sections.forEach(current => {
      const sectionHeight = current.offsetHeight;
      const sectionTop = current.offsetTop - 120;
      const sectionId = current.getAttribute('id');
      
      const navItem = document.querySelector(`.header__nav a[href*=${sectionId}]`);
      if (navItem) {
        if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
          document.querySelectorAll('.header__nav a').forEach(a => a.classList.remove('active'));
          navItem.classList.add('active');
        }
      }
    });
  });
}

// ─── DOM Initialization Loaders ─────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTracking();
  initHeader();
  initFAQs();
  initFloorPlanTabs();
  initPopup();
  initPhoneInputs();
  initLeadForms();
  initLightbox();
  initActiveNavHighlight();
});

// ═══════════════════════════════════════════════
// SECURITY MODULE: Global Source Code Protection
// ═══════════════════════════════════════════════
(function() {
  // Silent Right-Click Suppression (Permits form inputs and selection textareas)
  document.addEventListener('contextmenu', function(e) {
    const target = e.target;
    const isInteractive = target.closest('input, textarea, select') || (target.isContentEditable);
    if (!isInteractive) {
      e.preventDefault();
    }
  }, true);

  // Suppress Developer Console, View Source, Saving & Printing hotkeys
  document.addEventListener('keydown', function(e) {
    // 1. F12 key
    if (e.key === 'F12' || e.keyCode === 123) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // 2. Ctrl+Shift+I or Cmd+Option+I (Inspect)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.keyCode === 73)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // 3. Ctrl+Shift+J or Cmd+Option+J (Console)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'j' || e.keyCode === 74)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // 4. Ctrl+U or Cmd+Option+U (View Source)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'U' || e.key === 'u' || e.keyCode === 85)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // 5. Ctrl+S or Cmd+S (Save Page)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'S' || e.key === 's' || e.keyCode === 83)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // 6. Ctrl+P or Cmd+P (Print Page)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'P' || e.key === 'p' || e.keyCode === 80)) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);

  // Block copy triggers (Ctrl+C / Cmd+C) globally, allowing forms and selected inputs
  document.addEventListener('copy', function(e) {
    const activeEl = document.activeElement;
    const isInteractive = activeEl && (
      activeEl.closest('input, textarea, select') || 
      activeEl.isContentEditable
    );
    if (!isInteractive) {
      e.preventDefault();
      if (e.clipboardData) {
        e.clipboardData.setData('text/plain', 'Content Protected.');
      }
    }
  }, true);

  // Prevent asset drag-and-drop theft of protected layers or images
  document.addEventListener('dragstart', function(e) {
    const target = e.target;
    if (target.tagName === 'IMG' || target.closest('.secure-image-container')) {
      e.preventDefault();
    }
  }, true);
})();
