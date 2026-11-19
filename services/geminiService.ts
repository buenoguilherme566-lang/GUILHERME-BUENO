
import { GoogleGenAI } from "@google/genai";
import { InventoryItem, Transaction } from "../types";

export async function getStockInsights(items: InventoryItem[], history: Transaction[]) {
  try {
    const apiKey = (typeof process !== 'undefined' && process.env?.API_KEY) || (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
    if (!apiKey) {
      return "Chave de API Gemini não configurada no ambiente.";
    }
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
      Com base no seguinte inventário e histórico de transações, forneça 3 insights rápidos e úteis em português para o gerenciamento do estoque.
      Foque em itens com baixo estoque, movimentação frequente ou valor total.
      
      Inventário: ${JSON.stringify(items.map(i => ({ name: i.name, qty: i.quantity, val: i.value })))}
      Histórico Recente: ${JSON.stringify(history.slice(0, 5).map(h => ({ item: h.itemName, type: h.type, qty: h.quantity })))}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "Você é um consultor especialista em logística e gestão de estoque. Seja direto e prático.",
        temperature: 0.7,
      }
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Insight Error:", error);
    return "Não foi possível gerar insights no momento.";
  }
}
