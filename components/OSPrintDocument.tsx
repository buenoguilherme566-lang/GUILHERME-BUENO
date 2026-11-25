import React, { useRef, useState } from 'react';
import { Printer, X, Download, CheckCircle, Loader2 } from 'lucide-react';
import { ServiceOrder, LaborItem, OSPart, Tenant, OSStatus } from '../types';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface Props {
  os: ServiceOrder | null;
  isPreviewModal?: boolean;
  onClosePreview?: () => void;
  onPrint?: () => void;
  tenant?: Tenant;
}

export const getLaborOriginalValue = (labor: LaborItem): number => {
  if (labor.originalTotal !== undefined) return labor.originalTotal;
  if (labor.pricingType === 'fixed' && labor.fixedValue !== undefined) {
    return labor.fixedValue;
  }
  const totalHours = (labor.hours || 0) + ((labor.minutes || 0) / 60);
  return totalHours * (labor.valuePerHour || 0);
};

export const getLaborFinalValue = (labor: LaborItem): number => {
  if (labor.finalTotal !== undefined) {
    return labor.finalTotal;
  }
  const original = getLaborOriginalValue(labor);
  if (labor.discountValue && labor.discountValue > 0) {
    return Math.max(0, original - labor.discountValue);
  }
  if (labor.discountPercentage && labor.discountPercentage > 0) {
    return Math.max(0, original - (original * labor.discountPercentage / 100));
  }
  return original;
};

export const getLaborDiscountAmount = (labor: LaborItem): number => {
  const original = getLaborOriginalValue(labor);
  const finalVal = getLaborFinalValue(labor);
  return Math.max(0, original - finalVal);
};

export const getPartOriginalValue = (part: OSPart): number => {
  if (typeof part.originalTotal === 'number' && !isNaN(part.originalTotal)) {
    return Math.max(0, part.originalTotal);
  }
  const baseQtyTotal = Math.round(((part.quantity || 0) * (part.unitValue || 0)) * 100) / 100;
  if (typeof part.totalValue === 'number' && !isNaN(part.totalValue) && (part.discountValue || 0) > 0) {
    return Math.round((part.totalValue + (part.discountValue || 0)) * 100) / 100;
  }
  return baseQtyTotal;
};

export const getPartFinalValue = (part: OSPart): number => {
  if (typeof part.totalValue === 'number' && !isNaN(part.totalValue)) {
    return Math.max(0, part.totalValue);
  }
  const orig = getPartOriginalValue(part);
  const disc = Math.max(0, Number(part.discountValue) || 0);
  return Math.max(0, Math.round((orig - disc) * 100) / 100);
};

export const getPartDiscountAmount = (part: OSPart): number => {
  const original = getPartOriginalValue(part);
  const finalVal = getPartFinalValue(part);
  const diff = Math.max(0, Math.round((original - finalVal) * 100) / 100);
  if (diff > 0) return diff;
  return Math.max(0, Number(part.discountValue) || 0);
};

/**
 * Dispara a impressão física ou diálogo do navegador formatado rigorosamente para folha A4
 */
export const printOSDocument = (element: HTMLElement, title = 'Ordem de Serviço - HPS Control') => {
  try {
    const existing = document.getElementById('hps-print-iframe');
    if (existing) existing.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'hps-print-iframe';
    // O frame fica ancorado à viewport com 1px de dimensão e opacidade quase imperceptível (0.01)
    // Isso evita que navegadores com restrições de sandbox ignorem o frame por considerá-lo inativo ou invisível
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '10px';
    iframe.style.height = '10px';
    iframe.style.border = '0';
    iframe.style.zIndex = '-1';
    iframe.style.opacity = '0.01';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);

    const frameDoc = iframe.contentWindow?.document;
    if (!frameDoc) {
      window.print();
      return;
    }

    let stylesHtml = '';
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
      stylesHtml += node.outerHTML;
    });

    frameDoc.open();
    frameDoc.write(`
      <!DOCTYPE html>
      <html lang="pt-br">
        <head>
          <meta charset="utf-8">
          <title>${title}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          ${stylesHtml}
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm;
            }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
              box-sizing: border-box !important;
            }
            html, body {
              background: #ffffff !important;
              color: #000000 !important;
              margin: 0 !important;
              padding: 0 !important;
              font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
            }
            .a4-print-wrapper {
              width: 100%;
              max-width: 194mm;
              margin: 0 auto;
              background: #ffffff;
            }
            tr, .avoid-break {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            table {
              page-break-inside: auto;
            }
            thead {
              display: table-header-group;
            }
            tfoot {
              display: table-footer-group;
            }
          </style>
        </head>
        <body>
          <div class="a4-print-wrapper">
            ${element.innerHTML}
          </div>
        </body>
      </html>
    `);
    frameDoc.close();

    const doPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.warn('Falha no print do iframe, acionando fallback window.print', err);
        window.print();
      } finally {
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 10000);
      }
    };

    setTimeout(doPrint, 500);
  } catch (err) {
    console.error('Erro ao acionar impressão:', err);
    window.print();
  }
};

/**
 * Gera e baixa o arquivo PDF no formato tradicional A4 (210mm x 297mm) sem cortes nem distorções
 */
export const generateOSPdf = async (element: HTMLElement, filename: string): Promise<void> => {
  // Criamos um contêiner de estágio no DOM com coordenadas fixas (0, 0) e largura exata A4 (794px a 96 DPI)
  // Isso isola a renderização de qualquer rolagem do modal e de larguras de tela do celular/computador
  const staging = document.createElement('div');
  staging.id = 'hps-pdf-render-staging';
  staging.style.position = 'fixed';
  staging.style.top = '0';
  staging.style.left = '0';
  staging.style.width = '794px';
  staging.style.minWidth = '794px';
  staging.style.maxWidth = '794px';
  staging.style.background = '#ffffff';
  staging.style.zIndex = '-100';
  staging.style.opacity = '0.01';
  staging.style.pointerEvents = 'none';
  staging.style.boxSizing = 'border-box';
  staging.style.margin = '0';
  staging.style.padding = '0';

  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.width = '794px';
  clone.style.maxWidth = '794px';
  clone.style.minWidth = '794px';
  clone.style.margin = '0';
  clone.style.padding = '24px 28px'; // Margem interna tradicional A4
  clone.style.boxSizing = 'border-box';
  clone.style.borderRadius = '0';
  clone.style.boxShadow = 'none';
  clone.style.background = '#ffffff';

  staging.appendChild(clone);
  document.body.appendChild(staging);

  try {
    const canvas = await html2canvas(clone, {
      scale: 2, // Resolução Retina 2x para nitidez perfeita de textos e tabelas
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: 794,
      windowWidth: 794,
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0
    });

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 8; // Margem de 8mm em folha A4
    const printableWidth = pageWidth - (margin * 2); // 194mm de largura útil
    const printableHeight = pageHeight - (margin * 2); // 281mm de altura útil

    const contentHeightMm = (canvas.height * printableWidth) / canvas.width;

    // Se o documento couber em 1 página A4 (padrão para ordens de serviço normais)
    if (contentHeightMm <= printableHeight + 6) {
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      pdf.addImage(imgData, 'JPEG', margin, margin, printableWidth, Math.min(printableHeight, contentHeightMm));
    } else {
      // Documento com muitos itens: divide com precisão em páginas A4 sem cortar no meio
      const pageCanvasHeight = (canvas.width * printableHeight) / printableWidth;
      let currentY = 0;
      let pageNum = 0;

      while (currentY < canvas.height) {
        if (pageNum > 0) {
          pdf.addPage('a4', 'portrait');
        }

        const chunkHeight = Math.min(pageCanvasHeight, canvas.height - currentY);
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = chunkHeight;
        const ctx = pageCanvas.getContext('2d');

        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          ctx.drawImage(
            canvas,
            0, currentY, canvas.width, chunkHeight,
            0, 0, canvas.width, chunkHeight
          );

          const chunkData = pageCanvas.toDataURL('image/jpeg', 0.98);
          const chunkMmHeight = (chunkHeight * printableWidth) / canvas.width;
          pdf.addImage(chunkData, 'JPEG', margin, margin, printableWidth, chunkMmHeight);
        }

        currentY += chunkHeight;
        pageNum++;
      }
    }

    pdf.save(filename);
  } finally {
    if (document.body.contains(staging)) {
      document.body.removeChild(staging);
    }
  }
};

export const OSPrintDocument: React.FC<Props> = ({
  os,
  isPreviewModal = false,
  onClosePreview,
  onPrint,
  tenant
}) => {
  const printContentRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [pdfSuccessMessage, setPdfSuccessMessage] = useState(false);

  if (!os) return null;

  const totalPartsGross = os.parts.reduce((acc, p) => acc + getPartOriginalValue(p), 0);
  const totalPartsDiscount = os.parts.reduce((acc, p) => acc + getPartDiscountAmount(p), 0);
  const totalParts = os.parts.reduce((acc, p) => acc + getPartFinalValue(p), 0);
  const totalLaborGross = os.laborItems.reduce((acc, l) => acc + getLaborOriginalValue(l), 0);
  const totalLaborDiscount = os.laborItems.reduce((acc, l) => acc + getLaborDiscountAmount(l), 0);
  const totalLaborNet = os.laborItems.reduce((acc, l) => acc + getLaborFinalValue(l), 0);
  const totalOverallDiscount = totalPartsDiscount + totalLaborDiscount;
  const grandTotal = totalParts + totalLaborNet;

  const handleSavePdf = async () => {
    if (!printContentRef.current) return;
    try {
      setIsGeneratingPdf(true);
      setPdfSuccessMessage(false);

      const cleanCustomer = (os.customerName || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `OS_${os.osNumber || 'relatorio'}_${cleanCustomer}.pdf`;

      await generateOSPdf(printContentRef.current, filename);

      setPdfSuccessMessage(true);
      setTimeout(() => setPdfSuccessMessage(false), 5000);
    } catch (err) {
      console.error('Erro ao gerar arquivo PDF A4:', err);
      // Fallback
      handlePrint();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    setIsPrinting(true);
    if (printContentRef.current) {
      printOSDocument(printContentRef.current, `OS #${os.osNumber} - ${os.customerName}`);
    } else {
      if (onPrint) onPrint();
      else window.print();
    }
    setTimeout(() => setIsPrinting(false), 2000);
  };

  const documentContent = (
    <div
      ref={printContentRef}
      className="bg-white text-black p-6 font-sans leading-normal rounded-none shadow-none w-full max-w-[794px] mx-auto box-border"
    >
      {/* CABEÇALHO OFICIAL */}
      <div className="border-b-2 border-black pb-3 mb-3.5 flex flex-col sm:flex-row justify-between items-start gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {tenant?.logoUrl ? (
              <img src={tenant.logoUrl} alt={tenant.name} className="h-8 max-w-[120px] object-contain rounded" />
            ) : null}
            <h1 className="text-2xl font-black uppercase tracking-tight text-black">
              {tenant?.name || 'HPS CONTROL'}
            </h1>
            <span className="px-2 py-0.5 bg-black text-white text-[9px] font-black uppercase tracking-widest rounded">
              {tenant?.subtitle?.split('•')[0]?.trim() || 'BRP Especialista'}
            </span>
          </div>
          <p className="text-xs font-bold uppercase text-zinc-700 tracking-wider mt-0.5">
            {tenant?.corporateName ? `${tenant.corporateName} • ` : ''}
            {tenant?.subtitle || 'Gestão Especializada Can-Am BRP • Centro Técnico de Oficina & Preparação'}
          </p>
          <div className="text-[10px] text-zinc-600 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {tenant?.cnpj && <span><strong>CNPJ:</strong> {tenant.cnpj}</span>}
            {tenant?.phone && <span><strong>Tel/WhatsApp:</strong> {tenant.phone}</span>}
            {tenant?.email && <span><strong>Email:</strong> {tenant.email}</span>}
            {tenant?.address?.city && (
              <span>
                <strong>Endereço:</strong> {tenant.address.street ? `${tenant.address.street}, ` : ''}{tenant.address.number ? `${tenant.address.number} - ` : ''}{tenant.address.city}/{tenant.address.state || ''}
              </span>
            )}
          </div>
        </div>
        <div className="text-left sm:text-right border-l-2 sm:border-l-0 pl-3 sm:pl-0 border-zinc-300">
          <div className="text-base sm:text-lg font-black uppercase border-2 border-black px-3.5 py-1 bg-zinc-100 inline-block tracking-tight">
            ORDEM DE SERVIÇO #{os.osNumber}
          </div>
          <p className="text-[10px] font-bold uppercase text-zinc-600 mt-1">
            Abertura: {new Date(os.createdAt).toLocaleDateString('pt-BR')} às {new Date(os.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
          {(os.status === OSStatus.COMPLETED || os.completedAt) && (
            <p className="text-[10px] font-black uppercase text-green-800 bg-green-100 border border-green-300 px-2 py-0.5 rounded mt-1 inline-block">
              Finalizada (Auditoria): {new Date(os.completedAt || os.updatedAt).toLocaleDateString('pt-BR')} às {new Date(os.completedAt || os.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
          <p className="text-[10px] font-black uppercase text-zinc-800 mt-0.5">
            Status: <span className="underline">{os.status === OSStatus.COMPLETED ? 'FINALIZADA / ARQUIVADA' : os.status}</span>
          </p>
        </div>
      </div>

      {/* DADOS DE IDENTIFICAÇÃO DO CLIENTE, VEÍCULO E MECÂNICO */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-zinc-300 p-3 rounded mb-3.5 bg-zinc-50 text-xs">
        <div className="space-y-1">
          <p>
            <span className="font-bold uppercase text-zinc-500">Cliente Proprietário:</span>{' '}
            <strong className="text-black uppercase text-sm">{os.customerName}</strong>
          </p>
          <p>
            <span className="font-bold uppercase text-zinc-500">Mecânico / Técnico:</span>{' '}
            <strong className="text-black uppercase">{os.mechanicName || 'Oficina Geral / Plantão Técnico'}</strong>
          </p>
        </div>
        <div className="space-y-1">
          <p>
            <span className="font-bold uppercase text-zinc-500">Veículo / Modelo:</span>{' '}
            <strong className="text-black uppercase text-sm">{os.vehicleModel}</strong>
          </p>
          <p>
            <span className="font-bold uppercase text-zinc-500">Data de Emissão / Impressão:</span>{' '}
            <strong className="text-black uppercase">{new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</strong>
          </p>
          {(os.status === OSStatus.COMPLETED || os.completedAt) && (
            <p>
              <span className="font-bold uppercase text-zinc-500">Fechamento da O.S.:</span>{' '}
              <strong className="text-black uppercase">
                {new Date(os.completedAt || os.updatedAt).toLocaleDateString('pt-BR')} às {new Date(os.completedAt || os.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                {os.completedBy ? ` (${os.completedBy})` : ''}
              </strong>
            </p>
          )}
        </div>
      </div>

      {/* SEÇÃO 1: MÃO DE OBRA E SERVIÇOS EXECUTADOS */}
      <div className="mb-3.5">
        <div className="border-b-2 border-black pb-1 mb-2 flex justify-between items-center">
          <h3 className="text-xs font-black uppercase tracking-wider text-black">
            1. DISCRIMINAÇÃO DE MÃO DE OBRA E SERVIÇOS TÉCNICOS
          </h3>
          <span className="text-[10px] font-bold text-zinc-600 uppercase">
            Total de {os.laborItems.length} serviço(s)
          </span>
        </div>

        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-y border-zinc-300 bg-zinc-100 text-[9px] font-black uppercase text-zinc-700">
              <th className="p-2 w-8">#</th>
              <th className="p-2">Descrição do Serviço</th>
              <th className="p-2">Setor</th>
              <th className="p-2 text-center">Horas</th>
              <th className="p-2 text-right">Vlr/Hora</th>
              <th className="p-2 text-right">Valor Bruto</th>
              <th className="p-2 text-right">Desc. Compartilhado</th>
              <th className="p-2 text-right">Total Faturado</th>
            </tr>
          </thead>
          <tbody>
            {os.laborItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-3 text-center text-zinc-500 italic">
                  Nenhum serviço de mão de obra lançado nesta Ordem de Serviço.
                </td>
              </tr>
            ) : (
              os.laborItems.map((labor, idx) => {
                const gross = getLaborOriginalValue(labor);
                const finalVal = getLaborFinalValue(labor);
                const discount = gross - finalVal;
                const isShared = Boolean(labor.isShared || labor.linkedToId || discount > 0);
                const isFixed = labor.pricingType === 'fixed';
                const linkedLabor = labor.linkedToId ? os.laborItems.find(l => l.id === labor.linkedToId) : null;

                const timeLabel = isFixed 
                  ? 'Preço Fixo' 
                  : `${labor.hours || 0}h${labor.minutes ? ` ${labor.minutes}m` : ''}`;

                return (
                  <tr key={labor.id || idx} className={`border-b border-zinc-200 avoid-break ${isShared ? 'bg-amber-50/40' : ''}`}>
                    <td className="p-2 font-mono text-[10px]">{idx + 1}</td>
                    <td className="p-2">
                      <div className="font-black uppercase text-black flex items-center gap-1.5 flex-wrap">
                        {labor.description}
                        {isFixed && (
                          <span className="px-1.5 py-0.5 bg-blue-100 border border-blue-300 text-blue-900 rounded text-[7px] font-black uppercase tracking-wider">
                            POR DIFICULDADE / FIXO
                          </span>
                        )}
                        {isShared && (
                          <span className="px-1.5 py-0.5 bg-amber-200 border border-amber-400 text-amber-900 rounded text-[7px] font-black uppercase tracking-wider">
                            M.O. COMPARTILHADA
                          </span>
                        )}
                      </div>

                      {/* Box informativo de Mão de Obra Compartilhada */}
                      {isShared && (
                        <div className="mt-1 p-1.5 bg-amber-100/70 border border-amber-300 rounded text-[9.5px] text-amber-950 space-y-0.5">
                          <p className="font-bold uppercase tracking-tight text-amber-900">
                            🔗 Aproveitamento de Desmontagem ({labor.discountPercentage || (gross > 0 ? Math.round((discount / gross) * 100) : 0)}% de desconto concedido):
                          </p>
                          {linkedLabor && (
                            <p className="italic text-zinc-700">
                              ↳ Vinculado à M.O. principal: <strong>{linkedLabor.description}</strong>
                            </p>
                          )}
                          <p className="italic text-zinc-700">
                            Justificativa: {labor.sharedReason || 'Metade do serviço (desmontagem e acesso à região) já foi executado no serviço principal.'}
                          </p>
                        </div>
                      )}
                    </td>
                    <td className="p-2 uppercase text-zinc-600 text-[10px]">
                      {labor.section || '-'}
                    </td>
                    <td className="p-2 text-center font-mono font-bold text-[10px]">
                      {timeLabel}
                    </td>
                    <td className="p-2 text-right font-mono text-[10px]">
                      {isFixed ? '-' : `R$ ${(Number(labor.valuePerHour) || 0).toLocaleString('pt-BR')}/h`}
                    </td>
                    <td className="p-2 text-right font-mono font-bold">
                      R$ {gross.toLocaleString('pt-BR')}
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-amber-800">
                      {discount > 0 ? (
                        <span>- R$ {discount.toLocaleString('pt-BR')} ({labor.discountPercentage || (gross > 0 ? Math.round((discount / gross) * 100) : 0)}%)</span>
                      ) : (
                        <span className="text-zinc-400">-</span>
                      )}
                    </td>
                    <td className="p-2 text-right font-mono font-black text-black">
                      R$ {finalVal.toLocaleString('pt-BR')}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="font-bold bg-zinc-100 border-t-2 border-black text-xs">
              <td colSpan={5} className="p-2 text-right uppercase font-black">
                Subtotal Mão de Obra:
              </td>
              <td className="p-2 text-right font-mono">
                R$ {totalLaborGross.toLocaleString('pt-BR')}
              </td>
              <td className="p-2 text-right font-mono font-black text-amber-800">
                {totalLaborDiscount > 0 ? `- R$ ${totalLaborDiscount.toLocaleString('pt-BR')}` : 'R$ 0,00'}
              </td>
              <td className="p-2 text-right font-mono font-black text-black text-sm">
                R$ {totalLaborNet.toLocaleString('pt-BR')}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* SEÇÃO 2: PEÇAS E INSUMOS APLICADOS */}
      <div className="mb-3.5">
        <div className="border-b-2 border-black pb-1 mb-2 flex justify-between items-center">
          <h3 className="text-xs font-black uppercase tracking-wider text-black">
            2. DISCRIMINAÇÃO DE PEÇAS E INSUMOS APLICADOS
          </h3>
          <span className="text-[10px] font-bold text-zinc-600 uppercase">
            Total de {os.parts.length} item(ns)
          </span>
        </div>

        <table className="w-full text-xs text-left border-collapse">
          <thead>
            <tr className="border-y border-zinc-300 bg-zinc-100 text-[9px] font-black uppercase text-zinc-700">
              <th className="p-2 w-8">#</th>
              <th className="p-2">Descrição do Componente / Peça</th>
              <th className="p-2">Part Number BRP</th>
              <th className="p-2 text-center">Quantidade</th>
              <th className="p-2 text-right">Valor Unitário</th>
              <th className="p-2 text-right">Desconto</th>
              <th className="p-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {os.parts.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-3 text-center text-zinc-500 italic">
                  Nenhuma peça ou insumo registrado nesta Ordem de Serviço.
                </td>
              </tr>
            ) : (
              os.parts.map((p, idx) => {
                const origSubtotal = getPartOriginalValue(p);
                const partDiscount = getPartDiscountAmount(p);
                const subtotal = getPartFinalValue(p);
                const discountPct = origSubtotal > 0 && partDiscount > 0
                  ? Math.round((partDiscount / origSubtotal) * 1000) / 10
                  : (p.discountPercentage || 0);
                return (
                  <tr key={idx} className="border-b border-zinc-200 avoid-break">
                    <td className="p-2 font-mono text-[10px]">{idx + 1}</td>
                    <td className="p-2 font-bold uppercase text-black">
                      {p.name}
                      {p.mlQuantity ? (
                        <span className="ml-2 text-[8.5px] font-black uppercase text-blue-700 bg-blue-50 px-1 py-0.5 rounded border border-blue-200">
                          {p.mlQuantity} ml ({p.quantity} L)
                        </span>
                      ) : null}
                      {partDiscount > 0 && p.discountReason ? (
                        <div className="text-[8.5px] font-medium text-emerald-700 normal-case mt-0.5">
                          Desc.: {p.discountReason}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-2 font-mono uppercase text-zinc-700 font-bold">{p.partNumber || 'S/ PN'}</td>
                    <td className="p-2 text-center font-mono font-bold">
                      {p.mlQuantity ? `${p.mlQuantity} ml` : `${p.quantity} ${p.unit || 'un'}`}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {p.mlQuantity ? (
                        <div>
                          <div>R$ {(p.unitValue / 1000).toFixed(4).replace('.', ',')} / ml</div>
                          <div className="text-[7.5px] text-zinc-500 font-normal">Base: R$ {p.unitValue.toFixed(2).replace('.', ',')} / L</div>
                        </div>
                      ) : (
                        `R$ ${p.unitValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      )}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {partDiscount > 0 ? (
                        <span className="text-emerald-700 font-bold text-[10px]">
                          - R$ {partDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          {discountPct > 0 ? ` (${discountPct}%)` : ''}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="p-2 text-right font-mono font-bold text-black">
                      {partDiscount > 0 ? (
                        <div>
                          <div className="text-[8px] line-through text-zinc-400 font-normal">
                            De: R$ {origSubtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </div>
                          <div>R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        </div>
                      ) : (
                        `R$ ${subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            {totalPartsDiscount > 0 && (
              <>
                <tr className="bg-zinc-50 border-t border-zinc-300 text-[10px] text-zinc-600">
                  <td colSpan={6} className="p-1.5 text-right uppercase font-bold">
                    Subtotal Bruto Peças e Insumos:
                  </td>
                  <td className="p-1.5 text-right font-mono font-bold">
                    R$ {totalPartsGross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr className="bg-emerald-50 border-t border-emerald-200 text-[10px] text-emerald-800">
                  <td colSpan={6} className="p-1.5 text-right uppercase font-black">
                    (-) Descontos Concedidos em Peças:
                  </td>
                  <td className="p-1.5 text-right font-mono font-black">
                    - R$ {totalPartsDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </>
            )}
            <tr className="font-bold bg-zinc-100 border-t-2 border-black text-xs">
              <td colSpan={6} className="p-2 text-right uppercase font-black">
                {totalPartsDiscount > 0 ? 'Subtotal Líquido Peças e Insumos:' : 'Subtotal Peças e Insumos:'}
              </td>
              <td className="p-2 text-right font-mono font-black text-black text-sm">
                R$ {totalParts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* OBSERVAÇÕES TÉCNICAS E DIAGNÓSTICO */}
      {os.observations && (
        <div className="mb-3.5 p-3 border border-zinc-300 rounded bg-zinc-50 text-xs avoid-break">
          <p className="font-black uppercase text-[10px] text-zinc-700 mb-1 tracking-wider">
            Observações Técnicas / Diagnóstico da Oficina:
          </p>
          <p className="text-zinc-900 uppercase whitespace-pre-wrap leading-relaxed text-[11px]">
            {os.observations}
          </p>
        </div>
      )}

      {/* QUADRO DE FECHAMENTO FINANCEIRO */}
      <div className="border-2 border-black p-3.5 rounded mb-4 bg-zinc-50 avoid-break">
        <div className="border-b border-zinc-400 pb-1.5 mb-2.5 flex justify-between items-center">
          <h4 className="text-xs font-black uppercase tracking-wider text-black">
            QUADRO DEMONSTRATIVO DE FECHAMENTO FINANCEIRO
          </h4>
          <span className="text-[9px] font-mono text-zinc-500 font-bold uppercase">
            CONTROLE O.S. #{os.osNumber}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <div className="flex justify-between items-center py-0.5 border-b border-zinc-200">
              <span className="text-zinc-700 uppercase font-bold text-[11px]">
                {totalPartsDiscount > 0 ? '(+) Total de Peças e Insumos (Bruto):' : '(+) Total de Peças e Insumos:'}
              </span>
              <span className="font-mono font-black text-xs">R$ {totalPartsGross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between items-center py-0.5 border-b border-zinc-200">
              <span className="text-zinc-700 uppercase font-bold text-[11px]">(+) Total Mão de Obra (Valor Bruto):</span>
              <span className="font-mono font-black text-xs">R$ {totalLaborGross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            {totalPartsDiscount > 0 && (
              <div className="flex justify-between items-center py-0.5 border-b border-zinc-200 text-emerald-900 bg-emerald-100/70 px-1.5 rounded">
                <span className="uppercase font-black text-[10px]">(-) Desconto em Peças e Insumos:</span>
                <span className="font-mono font-black text-xs">- R$ {totalPartsDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between items-center py-0.5 border-b border-zinc-200 text-amber-900 bg-amber-100/60 px-1.5 rounded">
              <span className="uppercase font-black text-[10px]">(-) Desconto M.O. Compartilhada:</span>
              <span className="font-mono font-black text-xs">- R$ {totalLaborDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            {totalOverallDiscount > 0 && (
              <div className="flex justify-between items-center py-0.5 text-zinc-700 text-[10px] px-1">
                <span className="uppercase font-bold">Total de Descontos na O.S.:</span>
                <span className="font-mono font-bold">- R$ {totalOverallDiscount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="pt-1.5 border-t-2 border-black flex justify-between items-center">
              <span className="uppercase font-black text-xs text-black">(=) VALOR TOTAL LÍQUIDO A FATURAR:</span>
              <span className="font-mono font-black text-base text-black">
                R$ {grandTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* TERMO DE GARANTIA E CONDIÇÕES */}
      <div className="p-2.5 bg-zinc-50 border border-zinc-300 rounded text-[9.5px] text-zinc-700 leading-relaxed mb-4 avoid-break">
        <p className="font-bold text-black uppercase mb-0.5 tracking-wide">
          Termos de Garantia e Condições de Serviço:
        </p>
        <p className="text-zinc-600">
          {tenant?.printSettings?.warrantyTerms || 'Garantia legal de 90 (noventa) dias para serviços executados e peças conforme Art. 26 do Código de Defesa do Consumidor (CDC). A garantia cobre defeitos de montagem e fabricação de componentes genuínos.'}
        </p>
        {tenant?.printSettings?.footerMessage ? (
          <p className="font-bold text-zinc-900 mt-1 uppercase text-[9px]">
            {tenant.printSettings.footerMessage}
          </p>
        ) : null}
      </div>

      {/* TERMO DE ENCERRAMENTO E ASSINATURAS */}
      <div className="pt-3 border-t-2 border-black avoid-break">
        <div className="grid grid-cols-3 gap-4 text-center text-[9px]">
          <div>
            <div className="border-b border-black mb-1 h-9"></div>
            <p className="font-black uppercase text-black">Mecânico Responsável</p>
            <p className="text-zinc-600 uppercase font-semibold">{os.mechanicName || 'Oficina Técnica'}</p>
          </div>
          <div>
            <div className="border-b border-black mb-1 h-9"></div>
            <p className="font-black uppercase text-black">Chefe de Oficina</p>
            <p className="text-zinc-600 uppercase font-semibold">Validação Técnica e M.O.</p>
          </div>
          <div>
            <div className="border-b border-black mb-1 h-9"></div>
            <p className="font-black uppercase text-black">Setor Financeiro</p>
            <p className="text-zinc-600 uppercase font-semibold">Conferência e Faturamento</p>
          </div>
        </div>
        <p className="text-center text-[7.5px] text-zinc-500 uppercase tracking-widest mt-3.5">
          {tenant?.name || 'HPS Control'} • Software de Gestão de Ordens de Serviço • Documento Válido para Prestação de Contas e Auditoria
        </p>
      </div>
    </div>
  );

  // If used as an interactive preview modal on screen:
  if (isPreviewModal) {
    return (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[550] flex flex-col items-center justify-center p-2 sm:p-6 animate-in fade-in duration-200 print-hidden">
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-4xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
          {/* Top Bar */}
          <div className="p-4 bg-zinc-950 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-green-500/20 text-green-400 rounded-lg text-[9px] font-black uppercase tracking-wider">
                Relatório Oficial de O.S. (A4)
              </span>
              <span className="text-xs font-black text-white uppercase italic">
                O.S. #{os.osNumber} - {os.customerName}
              </span>
              {pdfSuccessMessage && (
                <span className="flex items-center gap-1 text-[10px] text-green-400 font-bold bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20 animate-in fade-in">
                  <CheckCircle size={12} /> PDF A4 salvo no seu computador!
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Botão de Salvar PDF no Computador */}
              <button
                type="button"
                onClick={handleSavePdf}
                disabled={isGeneratingPdf}
                className="px-4 py-2 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black rounded-xl font-black text-xs uppercase flex items-center gap-1.5 shadow-glow active:scale-95 transition-all"
                title="Salvar e baixar arquivo PDF A4 no seu computador"
              >
                {isGeneratingPdf ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Gerando PDF A4...
                  </>
                ) : (
                  <>
                    <Download size={14} /> Salvar PDF no Computador
                  </>
                )}
              </button>

              {/* Botão de Imprimir */}
              <button
                type="button"
                onClick={handlePrint}
                disabled={isPrinting}
                className="px-4 py-2 bg-white hover:bg-zinc-200 disabled:opacity-50 text-black rounded-xl font-black text-xs uppercase flex items-center gap-1.5 shadow-lg active:scale-95 transition-all"
                title="Imprimir Ordem de Serviço em folha A4"
              >
                {isPrinting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Imprimindo...
                  </>
                ) : (
                  <>
                    <Printer size={14} /> Imprimir Folha A4
                  </>
                )}
              </button>

              {/* Fechar Prévia */}
              <button
                type="button"
                onClick={onClosePreview}
                className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors"
                title="Fechar"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Printable Document Preview Area */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-zinc-950 custom-scrollbar">
            <div className="max-w-[794px] mx-auto shadow-2xl bg-white">
              {documentContent}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Otherwise, render the hidden print document that becomes visible on window.print()
  return (
    <div id="printable-os-document">
      {documentContent}
    </div>
  );
};

export default OSPrintDocument;
