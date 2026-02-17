import React from 'react'
import { X, Check, AlertCircle } from 'lucide-react'

interface CustomConfirmModalProps {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  isOpen: boolean
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'warning'
}

export const CustomConfirmModal = ({ 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  isOpen,
  confirmText = '确认',
  cancelText = '取消',
  variant = 'default'
}: CustomConfirmModalProps) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card rounded-xl border border-border shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200 slide-in-from-bottom-4">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            {variant === 'warning' && <AlertCircle className="h-6 w-6 text-orange-500" />}
            <h3 className="font-semibold text-lg text-foreground">{title}</h3>
          </div>
          <button onClick={onCancel} className="p-1 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-muted-foreground mb-8 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-3">
          <button 
            onClick={onCancel} 
            className="px-4 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-sm font-medium"
          >
            {cancelText}
          </button>
          <button 
            onClick={onConfirm} 
            className={`px-4 py-2 rounded-md text-primary-foreground transition-colors text-sm font-medium flex items-center gap-2 ${
              variant === 'warning' 
                ? 'bg-orange-500 hover:bg-orange-600' 
                : 'bg-primary hover:bg-primary/90'
            }`}
          >
            <Check className="h-4 w-4" />
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
