import { PixelWarning } from '../data/pixelIcons.js';

export class NotificationToast {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'notification-toast-container';
    Object.assign(this.container.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      pointerEvents: 'none',
      zIndex: '9999',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '20px',
      gap: '10px'
    });
    document.body.appendChild(this.container);
  }

  show(title, message, optionsOrClick = null) {
    const toast = document.createElement('div');
    const onClick = typeof optionsOrClick === 'function' ? optionsOrClick : optionsOrClick?.onClick;
    const isError = typeof optionsOrClick === 'object' && optionsOrClick !== null ? !!optionsOrClick.isError : false;
    const errorCategory = (typeof optionsOrClick === 'object' && optionsOrClick !== null && optionsOrClick.category) ? optionsOrClick.category : 'Sonstiges';
    
    // Neo-brutalist styling
    Object.assign(toast.style, {
      backgroundColor: '#FAFAFA',
      border: '3px solid #0D0D0D',
      boxShadow: '6px 6px 0px #0D0D0D',
      padding: '16px 20px',
      borderRadius: '0px',
      width: '100%',
      maxWidth: '400px',
      pointerEvents: 'auto',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease',
      transform: 'translateY(-100px)',
      opacity: '0',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      position: 'relative',
      overflow: 'hidden'
    });

    // Accent line
    const accent = document.createElement('div');
    Object.assign(accent.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      bottom: '0',
      width: '8px',
      backgroundColor: isError ? '#EF4444' : '#F20587'
    });
    toast.appendChild(accent);

    const titleEl = document.createElement('strong');
    titleEl.textContent = title;
    Object.assign(titleEl.style, {
      fontSize: '16px',
      color: '#0D0D0D',
      marginLeft: '10px'
    });
    
    const msgEl = document.createElement('span');
    msgEl.textContent = (message || '').replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, '').trim();
    Object.assign(msgEl.style, {
      fontSize: '14px',
      color: '#595959',
      marginLeft: '10px'
    });

    toast.appendChild(titleEl);
    toast.appendChild(msgEl);

    // If it is an error or reportable, append contextual quick report button
    if (isError) {
      const reportBtn = document.createElement('button');
      reportBtn.className = 'toast-report-btn';
      reportBtn.type = 'button';
      reportBtn.innerHTML = `${PixelWarning} <span>Problem melden</span>`;
      reportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dismiss(toast);
        if (typeof window !== 'undefined' && window.openReportModal) {
          window.openReportModal({
            prefillCategory: errorCategory,
            prefillMessage: `${title}: ${message}`
          });
        }
      });
      toast.appendChild(reportBtn);
    }
    
    if (onClick) {
      toast.addEventListener('click', () => {
        onClick();
        this.dismiss(toast);
      });
    }

    this.container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    });

    // Auto dismiss after 6s (or 8s for errors so user has time to tap report)
    const timeoutDuration = isError ? 8000 : 5000;
    setTimeout(() => {
      this.dismiss(toast);
    }, timeoutDuration);
  }

  showError(title, message, category = 'Sonstiges') {
    this.show(title, message, { isError: true, category });
  }

  dismiss(toast) {
    if (!toast || !toast.parentNode) return;
    toast.style.transform = 'translateY(-50px)';
    toast.style.opacity = '0';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }
}

export const notificationToast = new NotificationToast();
