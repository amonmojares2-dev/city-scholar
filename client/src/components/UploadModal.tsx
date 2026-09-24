import { useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";

const ACCEPTED_FILES = "image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf";

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface UploadModalProps {
    isOpen: boolean;
    documentName: string;
    onClose: () => void;
    onUpload: (file: File, onProgress: (progress: number) => void, signal: AbortSignal) => Promise<void>;
    validateFile: (file: File) => string;
}

/** Reusable document picker. The row's Upload button opens this dialog only. */
export default function UploadModal({
    isOpen,
    documentName,
    onClose,
    onUpload,
    validateFile,
}: UploadModalProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState("");
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState("");
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const chooseButtonRef = useRef<HTMLButtonElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const onCloseRef = useRef(onClose);
    const titleId = useId();
    const errorId = useId();
    const helpId = useId();
    onCloseRef.current = onClose;

    useEffect(() => {
        setSelectedFile(null);
        setPreviewUrl("");
        setProgress(0);
        setError("");
        setUploading(false);
        setDragOver(false);
    }, [isOpen]);

    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    useEffect(() => {
        if (!isOpen || !selectedFile || error || uploading) return;
        setProgress(1);
        const timer = window.setInterval(() => {
            setProgress(current => Math.min(100, current + 2));
        }, 20);
        return () => window.clearInterval(timer);
    }, [isOpen, selectedFile, error, uploading]);

    const closeModal = () => {
        abortControllerRef.current?.abort();
        onCloseRef.current();
    };

    useEffect(() => {
        if (!isOpen) return;
        const previous = document.activeElement as HTMLElement | null;
        const focusFrame = window.requestAnimationFrame(() => chooseButtonRef.current?.focus());

        const handleKeyDown = (event: globalThis.KeyboardEvent) => {
            if (event.key === "Escape") {
                closeModal();
                return;
            }
            if (event.key !== "Tab" || !dialogRef.current) return;
            const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
                "button:not([disabled]), a[href], [tabindex]:not([tabindex=\"-1\"])",
            ));
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => {
            window.cancelAnimationFrame(focusFrame);
            document.removeEventListener("keydown", handleKeyDown);
            previous?.focus();
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const selectFile = (file: File | null) => {
        if (!file || uploading) return;
        setSelectedFile(null);
        setPreviewUrl("");
        setProgress(0);
        setError("");
        const validationError = validateFile(file);
        if (validationError) {
            setError(validationError);
            return;
        }
        setSelectedFile(file);
        if (file.type === "image/png" || file.type === "image/jpeg") {
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.currentTarget.files?.[0] ?? null;
        event.currentTarget.value = "";
        selectFile(file);
    };

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragOver(false);
        selectFile(event.dataTransfer.files?.[0] ?? null);
    };

    const handleDropZoneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!uploading) fileInputRef.current?.click();
        }
    };

    const ready = Boolean(selectedFile) && progress === 100 && !error;
    const isImage = selectedFile?.type === "image/png" || selectedFile?.type === "image/jpeg";

    const upload = async () => {
        if (!selectedFile || !ready || uploading) return;
        const controller = new AbortController();
        abortControllerRef.current = controller;
        setUploading(true);
        setError("");
        setProgress(0);
        try {
            await onUpload(selectedFile, setProgress, controller.signal);
            setUploading(false);
            onClose();
        } catch (requestError) {
            if (controller.signal.aborted) return;
            setUploading(false);
            setError(requestError instanceof Error ? requestError.message : "Unable to upload document.");
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
            onMouseDown={event => {
                if (event.target === event.currentTarget) closeModal();
            }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={helpId}
                className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
            >
                <h2 id={titleId} className="text-lg font-bold text-[#1F2937]">{documentName}</h2>
                <p id={helpId} className="mt-1 text-xs text-[#6B7280]">Upload a PNG, JPEG, or PDF file up to 5 MB.</p>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_FILES}
                    hidden
                    disabled={uploading}
                    onChange={handleFileChange}
                />

                <div
                    role="button"
                    tabIndex={uploading ? -1 : 0}
                    aria-disabled={uploading}
                    onClick={() => !uploading && fileInputRef.current?.click()}
                    onKeyDown={handleDropZoneKeyDown}
                    onDragOver={event => { event.preventDefault(); if (!uploading) setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    className={`mt-4 cursor-pointer rounded-2xl border-2 border-dashed p-5 text-center transition-colors ${
                        dragOver ? "border-[#163A63] bg-blue-50" : "border-[#D1D5DB] hover:border-[#163A63]"
                    } ${uploading ? "pointer-events-none opacity-60" : ""}`}
                >
                    <Icon name="upload" size={22} className="mx-auto text-[#163A63]" />
                    <button
                        ref={chooseButtonRef}
                        type="button"
                        disabled={uploading}
                        onClick={event => { event.stopPropagation(); fileInputRef.current?.click(); }}
                        className="mt-2 rounded-lg border border-[#D1D5DB] px-4 py-2 text-sm font-semibold text-[#163A63] hover:bg-[#F0F4FA] disabled:opacity-50"
                    >
                        Choose file
                    </button>
                    <p className="mt-2 text-xs text-[#6B7280]">or drag and drop a file here</p>
                </div>

                {selectedFile && (
                    <div className="mt-4 overflow-hidden rounded-xl border border-[#E5E7EB] bg-[#F6F7F9]">
                        <div className="relative flex h-40 items-center justify-center overflow-hidden">
                            {isImage && previewUrl ? (
                                <img src={previewUrl} alt="Selected document preview" className={`h-full w-full object-contain transition-all ${ready ? "blur-0" : "blur-md opacity-50"}`} />
                            ) : (
                                <Icon name="file-text" size={44} className="text-[#64748B]" />
                            )}
                            {!ready && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/45 text-sm font-semibold text-[#0B1F3A]" role="status">
                                    {uploading ? "Uploading" : "Preparing preview"}: {progress}%
                                </div>
                            )}
                        </div>
                        <div className="p-3">
                            <p className="truncate text-sm font-semibold text-[#1F2937]">{selectedFile.name}</p>
                            <p className="mt-0.5 text-xs text-[#6B7280]">{formatFileSize(selectedFile.size)}</p>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E5E7EB]" aria-hidden="true">
                                <div className="h-full rounded-full bg-[#163A63] transition-[width] duration-100" style={{ width: `${progress}%` }} />
                            </div>
                            <p className="mt-1 text-right text-xs text-[#6B7280]" aria-live="polite">{progress}%</p>
                        </div>
                    </div>
                )}

                {error && <p id={errorId} role="alert" className="mt-3 text-sm text-[#DC2626]">{error}</p>}

                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button type="button" onClick={closeModal} className="rounded-xl border border-[#E5E5E5] px-4 py-2.5 text-sm font-semibold text-[#6B7280] hover:bg-[#F6F7F9]">Cancel</button>
                    <button type="button" disabled={!ready || uploading} onClick={upload} className="rounded-xl bg-[#0B1F3A] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#163A63] disabled:cursor-not-allowed disabled:opacity-40">
                        {uploading ? `Uploading… ${progress}%` : "Upload"}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

