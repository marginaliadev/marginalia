"use client";

import React from "react";
import { AlertCircle, CheckCircle, Info, X } from "lucide-react";

export interface ModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: "info" | "danger" | "success";
  confirmText?: string;
  onConfirm?: () => void;
  onClose: () => void;
}

export default function NoirModal({
  isOpen,
  title,
  message,
  type = "info",
  confirmText = "Understood",
  onConfirm,
  onClose,
}: ModalProps) {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case "danger":
        return <AlertCircle className="w-5 h-5 text-rose-400" />;
      case "success":
        return <CheckCircle className="w-5 h-5 text-emerald-400" />;
      default:
        return <Info className="w-5 h-5 text-[#f3db88]" />;
    }
  };

  const getBorderColor = () => {
    switch (type) {
      case "danger":
        return "border-rose-900/60";
      case "success":
        return "border-emerald-900/60";
      default:
        return "border-[#d4af37]/40";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn noir-modal-backdrop">
      <div
        className={`w-full max-w-md bg-[#120f0d] border ${getBorderColor()} rounded-xl p-6 shadow-2xl relative noir-modal-card text-[#eae5d9]`}
      >
        <button
          id="noirModalCloseBtn"
          onClick={onClose}
          className="absolute top-4 right-4 text-[#9c9485] hover:text-[#eae5d9] p-1 rounded-full transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-full bg-[#1c1613] border border-[#2e2620]">
            {getIcon()}
          </div>
          <h3 className="font-serif-academic text-lg font-semibold text-[#f5eedc] noir-modal-title">
            {title}
          </h3>
        </div>

        <p className="text-sm text-[#a8a092] leading-relaxed mb-6 font-sans-ui whitespace-pre-line noir-modal-body">
          {message}
        </p>

        <div className="flex justify-end gap-3">
          <button
            id="noirModalConfirmBtn"
            onClick={() => {
              if (onConfirm) onConfirm();
              onClose();
            }}
            className="btn-gold px-5 py-2 rounded-lg text-xs font-semibold"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
