import React from 'react'

interface Props {
  open: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ open, title, description, confirmText = '确认', cancelText = '取消', onConfirm, onCancel }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onCancel} />
      <div className="relative bg-card text-card-foreground rounded-xl shadow-lg w-[400px] p-6 border animate-in zoom-in-95 duration-200">
        <div className="text-lg font-semibold mb-2">{title}</div>
        {description && <div className="text-sm text-muted-foreground mb-6">{description}</div>}
        <div className="flex justify-end space-x-2">
          <button 
            className="px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" 
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button 
            className="px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow-sm" 
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}