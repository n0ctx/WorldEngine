export function pushToast(message, type = 'success') {
  window.dispatchEvent(new CustomEvent('we:toast', {
    detail: { message, type },
  }));
}

export function pushErrorToast(message)   { pushToast(message, 'error');   }
export function pushWarningToast(message) { pushToast(message, 'warning'); }
export function pushInfoToast(message)    { pushToast(message, 'info');    }
