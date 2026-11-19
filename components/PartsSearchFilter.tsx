import React from 'react';
import { Search, Filter, X, Tag, Layers, Hash } from 'lucide-react';

export type SearchFieldType = 'all' | 'name' | 'category' | 'partNumber';

interface PartsSearchFilterProps {
  searchTerm: string;
  onSearchTermChange: (val: string) => void;
  searchField: SearchFieldType;
  onSearchFieldChange: (val: SearchFieldType) => void;
  selectedCategory: string;
  onSelectedCategoryChange: (val: string) => void;
  categories: string[];
  totalItemsCount: number;
  filteredItemsCount: number;
}

export const PartsSearchFilter: React.FC<PartsSearchFilterProps> = ({
  searchTerm,
  onSearchTermChange,
  searchField,
  onSearchFieldChange,
  selectedCategory,
  onSelectedCategoryChange,
  categories,
  totalItemsCount,
  filteredItemsCount
}) => {
  const getPlaceholder = () => {
    switch (searchField) {
      case 'name':
        return 'Filtrar especificamente pelo NOME da peça (ex: Correia, Pastilha, Filtro)...';
      case 'category':
        return 'Filtrar pela CATEGORIA (ex: Freios, Motor, Insumos, Transmissão)...';
      case 'partNumber':
        return 'Filtrar por PART NUMBER / REF técnica (ex: 420280360, 715000932)...';
      case 'all':
      default:
        return 'Pesquisar peças por Nome, Categoria ou Part Number...';
    }
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 p-5 sm:p-6 rounded-[2.5rem] space-y-4 shadow-2xl backdrop-blur-md">
      {/* Header do Filtro com Seletor de Critério */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-green-500/10 rounded-xl text-green-500 border border-green-500/20">
            <Filter size={14} />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-white italic">
              Filtrar Estoque de Peças:
            </span>
            <p className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider">
              Selecione o critério para busca precisa
            </p>
          </div>
        </div>

        {/* Botões Seletor de Modo: Todos, Nome, Categoria, Part Number */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-black rounded-2xl border border-zinc-800/90 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => onSearchFieldChange('all')}
            className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${
              searchField === 'all'
                ? 'bg-green-500 text-black shadow-glow'
                : 'text-zinc-500 hover:text-white'
            }`}
          >
            Todos os Campos
          </button>
          <button
            type="button"
            onClick={() => onSearchFieldChange('name')}
            className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
              searchField === 'name'
                ? 'bg-green-500 text-black shadow-glow'
                : 'text-zinc-500 hover:text-white'
            }`}
          >
            <Tag size={10} />
            Nome
          </button>
          <button
            type="button"
            onClick={() => onSearchFieldChange('category')}
            className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
              searchField === 'category'
                ? 'bg-green-500 text-black shadow-glow'
                : 'text-zinc-500 hover:text-white'
            }`}
          >
            <Layers size={10} />
            Categoria
          </button>
          <button
            type="button"
            onClick={() => onSearchFieldChange('partNumber')}
            className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
              searchField === 'partNumber'
                ? 'bg-green-500 text-black shadow-glow'
                : 'text-zinc-500 hover:text-white'
            }`}
          >
            <Hash size={10} />
            Part Number
          </button>
        </div>
      </div>

      {/* Input de Busca + Dropdown de Categoria */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch">
        <div className="relative flex-1 group">
          <Search
            className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-green-500 transition-colors"
            size={18}
          />
          <input
            type="text"
            placeholder={getPlaceholder()}
            value={searchTerm}
            onChange={e => onSearchTermChange(e.target.value)}
            className="w-full bg-black border border-zinc-800 pl-14 pr-12 py-4 rounded-2xl font-bold text-xs text-white outline-none focus:border-green-500/50 shadow-inner transition-all placeholder:text-zinc-600"
          />
          {searchTerm && (
            <button
              onClick={() => onSearchTermChange('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white p-1"
              title="Limpar pesquisa"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Dropdown de Categorias */}
        <select
          value={selectedCategory}
          onChange={e => onSelectedCategoryChange(e.target.value)}
          className="w-full sm:w-60 bg-black border border-zinc-800 px-4 py-4 rounded-2xl text-[10px] font-black uppercase tracking-wider text-zinc-300 outline-none focus:border-green-500/50 transition-all cursor-pointer"
        >
          <option value="all">TODAS AS CATEGORIAS</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>
              {cat.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {/* Atalhos Rápidos de Categoria quando selecionado Categoria */}
      {searchField === 'category' && (
        <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-zinc-800/80 animate-in fade-in">
          <span className="text-[8px] font-black uppercase text-zinc-500 italic mr-2">
            Categorias Rápidas:
          </span>
          {categories.slice(0, 10).map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                onSearchTermChange(cat);
                onSelectedCategoryChange(cat);
              }}
              className={`px-3 py-1 rounded-xl text-[8px] font-black uppercase tracking-wider transition-all border ${
                selectedCategory === cat || searchTerm.toLowerCase() === cat.toLowerCase()
                  ? 'bg-green-500 text-black border-green-500 font-black shadow-glow'
                  : 'bg-black text-zinc-400 border-zinc-800 hover:border-zinc-700'
              }`}
            >
              {cat}
            </button>
          ))}
          {(selectedCategory !== 'all' || searchTerm) && (
            <button
              type="button"
              onClick={() => {
                onSelectedCategoryChange('all');
                onSearchTermChange('');
              }}
              className="text-[8px] text-zinc-500 hover:text-white underline uppercase font-bold ml-2"
            >
              Limpar Filtros
            </button>
          )}
        </div>
      )}

      {/* Indicador de Status dos Resultados */}
      <div className="flex flex-wrap justify-between items-center text-[9px] font-black uppercase tracking-wider text-zinc-500 px-1 pt-1">
        <div>
          Exibindo <span className="text-white">{filteredItemsCount}</span> de{' '}
          <span className="text-white">{totalItemsCount}</span> componentes
        </div>
        {(searchTerm || selectedCategory !== 'all' || searchField !== 'all') && (
          <div className="flex items-center gap-2">
            <span className="text-green-400 italic">
              {searchTerm && `Pesquisando por "${searchTerm}"`}
              {searchField !== 'all' && ` [Critério: ${searchField === 'name' ? 'Nome' : searchField === 'category' ? 'Categoria' : 'Part Number'}]`}
              {selectedCategory !== 'all' && ` [Categoria: ${selectedCategory}]`}
            </span>
            <button
              type="button"
              onClick={() => {
                onSearchTermChange('');
                onSelectedCategoryChange('all');
                onSearchFieldChange('all');
              }}
              className="text-zinc-500 hover:text-white underline"
            >
              Resetar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PartsSearchFilter;
