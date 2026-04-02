/**
 * Client-side auth helpers.
 * Use in Client Components ('use client') only.
 * Do NOT import this file from Server Components.
 */

import { createClient } from './client'

/**
 * Initiates Google OAuth sign-in flow.
 * Redirects the user to Google's consent screen.
 */
export async function signInWithGoogle(): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  })

  if (error) {
    throw new Error(`Google sign-in failed: ${error.message}. Please try again.`)
  }
}

/**
 * Opens Google OAuth in a popup window.
 * Resolves when the user completes sign-in and the popup closes.
 * The caller is responsible for navigating after this resolves.
 */
export async function signInWithGooglePopup(): Promise<void> {
  const supabase = createClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback?popup=true`,
      skipBrowserRedirect: true,
    },
  })

  if (error || !data.url) {
    throw new Error(`Google sign-in failed: ${error?.message ?? 'No URL returned'}. Please try again.`)
  }

  const popup = window.open(data.url, 'google-oauth', 'width=500,height=600,left=400,top=100')

  return new Promise((resolve, reject) => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (event.data?.type === 'oauth_success') {
        cleanup()
        resolve()
      }
    }

    const interval = setInterval(() => {
      if (popup?.closed) {
        cleanup()
        reject(new Error('로그인 창이 닫혔습니다. 다시 시도해주세요.'))
      }
    }, 500)

    function cleanup() {
      window.removeEventListener('message', onMessage)
      clearInterval(interval)
    }

    window.addEventListener('message', onMessage)
  })
}

export function isMobileBrowser(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
}

export function isInAppBrowser(): boolean {
  return /KAKAOTALK|Instagram|NAVER|Line|FB|Facebook|Twitter|Snapchat/i.test(navigator.userAgent)
}

/**
 * Attempts to open the current page in an external browser.
 * Android: redirects to Chrome via intent:// scheme.
 * iOS: tries Chrome via googlechrome:// scheme, then copies URL to clipboard as fallback.
 * Returns true if a redirect was attempted, false if fell back to clipboard copy.
 */
export async function openInExternalBrowser(): Promise<boolean> {
  const url = window.location.href

  if (/Android/i.test(navigator.userAgent)) {
    window.location.href = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`
    return true
  }

  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    window.location.href = url.replace(/^https?:\/\//, 'googlechrome://')
    // If Chrome is not installed the redirect silently fails — fall back to clipboard
    await new Promise(resolve => setTimeout(resolve, 1500))
  }

  try {
    await navigator.clipboard.writeText(url)
  } catch {
    // Clipboard API unavailable — user will need to copy manually
  }
  return false
}

/**
 * Signs the current user out and clears the session.
 */
export async function signOut(): Promise<void> {
  const supabase = createClient()

  const { error } = await supabase.auth.signOut()

  if (error) {
    throw new Error(`Sign-out failed: ${error.message}. Please try again.`)
  }
}
