import React from 'react'

interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  duration?: number
}

let toastContainer: HTMLDivElement | null = null

function ensureToastContainer(): HTMLDivElement {
  if (!toastContainer) {
    toastContainer = document.createElement('div')
    toastContainer.className = 'toast-container'
    toastContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
    `
    document.body.appendChild(toastContainer)
  }
  return toastContainer
}

export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info', duration: number = 3000) {
  const container = ensureToastContainer()

  const toast = document.createElement('div')
  const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500'
  toast.className = `toast-item px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium transform transition-all duration-300 translate-x-full ${bgColor}`
  toast.textContent = message

  container.appendChild(toast)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.remove('translate-x-full')
    })
  })

  setTimeout(() => {
    toast.classList.add('translate-x-full', 'opacity-0')
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast)
      }
    }, 300)
  }, duration)
}

export function Toast({ message, type = 'info' }: ToastProps) {
  return null
}

export default showToast