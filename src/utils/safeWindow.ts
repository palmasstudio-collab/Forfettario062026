/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Safely calls alert() wrapping it in a try-catch to prevent SecurityError
 * in sandboxed iframes where allow-modals might be missing.
 */
export function safeAlert(message: string): void {
  try {
    if (typeof window !== 'undefined' && window.alert) {
      window.alert(message);
    } else {
      console.log("[SANDBOXED ALERT]:", message);
    }
  } catch (err) {
    console.warn("Blocked standard alert() call in sandboxed iframe environment:", err);
  }
}

/**
 * Safely calls confirm() wrapping it in a try-catch to prevent SecurityError
 * in sandboxed iframes. Falls back to auto-approval to allow the user
 * action to proceed without freezing or crashing the screen.
 */
export function safeConfirm(message: string, defaultApproval = true): boolean {
  try {
    if (typeof window !== 'undefined' && window.confirm) {
      return window.confirm(message);
    }
  } catch (err) {
    console.warn("Blocked standard confirm() call in sandboxed iframe environment. Resolved auto-approval:", err);
  }
  return defaultApproval;
}
