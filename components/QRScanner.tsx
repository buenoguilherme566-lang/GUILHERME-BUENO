
import React, { useEffect, useRef, useState } from 'react';
import { X, QrCode, Zap, RefreshCcw } from 'lucide-react';

interface QRScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

// Declarando a tipagem para a biblioteca global importada via script no index.html
declare const Html5Qrcode: any;

const QRScanner: React.FC<QRScannerProps> = ({ onScan, onClose }) => {
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const html5QrCodeRef = useRef<any>(null);
  const scannerId = "hps-qr-reader";

  useEffect(() => {
    if (typeof Html5Qrcode === 'undefined') {
      setError("Biblioteca do leitor QR Code não foi carregada. Verifique sua conexão com a internet e recarregue a página.");
      return;
    }

    // Inicializa o objeto do scanner
    html5QrCodeRef.current = new Html5Qrcode(scannerId);

    const config = { 
      fps: 20, 
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0
    };

    // Tenta iniciar a câmera traseira imediatamente
    const startScanner = async () => {
      try {
        await html5QrCodeRef.current.start(
          { facingMode: "environment" }, // Tenta câmera traseira
          config,
          (decodedText: string) => {
            // Sucesso na leitura
            onScan(decodedText);
            stopScanner();
          },
          (errorMessage: string) => {
            // Erros de leitura (ignorado para não poluir o log)
          }
        );
        setIsCameraReady(true);
      } catch (err: any) {
        console.error("Erro ao iniciar câmera traseira, tentando qualquer câmera disponível...", err);
        // Fallback para qualquer câmera se a traseira falhar (comum em desktops)
        try {
          await html5QrCodeRef.current.start(
            { facingMode: "user" },
            config,
            (decodedText: string) => {
              onScan(decodedText);
              stopScanner();
            },
            () => {}
          );
          setIsCameraReady(true);
        } catch (fallbackErr: any) {
          setError("Não foi possível acessar a câmera. Verifique as permissões do navegador.");
        }
      }
    };

    const stopScanner = async () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        try {
          await html5QrCodeRef.current.stop();
        } catch (err) {
          console.error("Erro ao parar o scanner", err);
        }
      }
      onClose();
    };

    startScanner();

    // Cleanup ao desmontar o componente
    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch((e: any) => console.error(e));
      }
    };
  }, [onScan, onClose]);

  return (
    <div className="fixed inset-0 bg-black z-[200] flex flex-col items-center justify-center animate-in fade-in duration-300">
      {/* Header do Scanner */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-500 rounded-2xl flex items-center justify-center text-black shadow-glow">
            <QrCode size={20} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-sm font-black text-white uppercase italic tracking-widest leading-none">HPS Scanner</h2>
            <p className="text-[8px] text-green-500 font-bold uppercase tracking-tighter mt-1">Leitor em tempo real</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-4 bg-zinc-900/80 text-white rounded-2xl border border-zinc-800 active:scale-90 transition-transform"
        >
          <X size={24} />
        </button>
      </div>

      {/* Área da Câmera */}
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        <div id={scannerId} className="w-full h-full object-cover"></div>
        
        {/* Overlay de Scan */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          {/* Moldura de Foco */}
          <div className="relative w-64 h-64">
            {/* Cantos da Moldura */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-500 rounded-tl-lg"></div>
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-500 rounded-tr-lg"></div>
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-500 rounded-bl-lg"></div>
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-500 rounded-br-lg"></div>
            
            {/* Linha de Scanner Animada */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-green-500/50 shadow-[0_0_15px_#22c55e] animate-[scan_2s_linear_infinite]"></div>
          </div>
        </div>

        {/* Mensagens de Status */}
        {!isCameraReady && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-4">
            <div className="animate-spin w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full"></div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Iniciando Lente HPS...</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black p-10 text-center gap-6">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center text-red-500">
              <Zap size={40} />
            </div>
            <p className="text-xs font-black text-zinc-300 uppercase leading-relaxed">{error}</p>
            <button onClick={onClose} className="px-8 py-4 bg-zinc-800 text-white rounded-2xl font-black uppercase text-[10px]">Tentar Novamente</button>
          </div>
        )}
      </div>

      {/* Footer / Instruções */}
      <div className="absolute bottom-0 left-0 right-0 p-10 text-center bg-gradient-to-t from-black/80 to-transparent">
        <p className="text-[10px] font-black text-white uppercase tracking-widest mb-2 italic">Aponte para o QR Code da peça</p>
        <p className="text-[8px] text-zinc-500 font-bold uppercase tracking-tighter max-w-[200px] mx-auto opacity-70">O sistema identificará automaticamente o Part Number e abrirá a ficha técnica do item.</p>
      </div>

      <style>{`
        @keyframes scan {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
        #hps-qr-reader video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
        }
      `}</style>
    </div>
  );
};

export default QRScanner;
