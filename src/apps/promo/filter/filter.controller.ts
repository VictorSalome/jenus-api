 import { Request, Response } from 'express';
import * as filterRepo from './filter.repository.js';

export const list = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [categories, filters] = await Promise.all([
      filterRepo.findAllCategories(),
      filterRepo.findAllFilters(),
    ]);
    
    // Agrupa filtros por categoria usando Map para O(n+m)
    const filtersByCategory = new Map<number, any[]>();
    for (const f of filters) {
      const existing = filtersByCategory.get(f.category_id) || [];
      existing.push(f);
      filtersByCategory.set(f.category_id, existing);
    }
    
    const categoriesWithFilters = categories.map((cat: any) => ({
      ...cat,
      filters: filtersByCategory.get(cat.id) || []
    }));
    
    res.json({ success: true, data: categoriesWithFilters });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao listar filtros' });
  }
};

export const createCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, color, icon } = req.body;
    
    if (!name || name.trim() === '') {
      res.status(400).json({ success: false, message: 'Nome da categoria é obrigatório' });
      return;
    }
    
    // Verificar se categoria já existe
    const existing = await filterRepo.findCategoryByName(name.trim());
    if (existing) {
      res.status(409).json({ success: false, message: 'Categoria já existe' });
      return;
    }
    
    const id = await filterRepo.createCategory({ name: name.trim(), color, icon });
    res.json({ success: true, message: 'Categoria criada', data: { id } });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      res.status(409).json({ success: false, message: 'Categoria já existe' });
    } else {
      res.status(500).json({ success: false, message: 'Erro ao criar categoria' });
    }
  }
};

export const updateCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { name, color } = req.body;
    
    if (name && name.trim() !== '') {
      // Verificar se outra categoria já tem esse nome
      const existing = await filterRepo.findCategoryByName(name.trim());
      if (existing && existing.id !== id) {
        res.status(409).json({ success: false, message: 'Já existe uma categoria com esse nome' });
        return;
      }
    }
    
    await filterRepo.updateCategory(id, { name: name?.trim(), color });
    res.json({ success: true, message: 'Categoria atualizada' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao atualizar categoria' });
  }
};

export const createFilter = async (req: Request, res: Response): Promise<void> => {
  try {
    const { categoryId, name, type, keywords } = req.body;
    
    if (!categoryId || !name || !keywords) {
      res.status(400).json({ success: false, message: 'Dados inválidos' });
      return;
    }
    
    if (!name.trim()) {
      res.status(400).json({ success: false, message: 'Nome do filtro é obrigatório' });
      return;
    }
    
    // Verificar se filtro já existe na categoria
    const existing = await filterRepo.findFilterByNameAndCategory(name.trim(), Number(categoryId));
    if (existing) {
      res.status(409).json({ success: false, message: 'Já existe um filtro com esse nome nesta categoria' });
      return;
    }
    
    const keywordsArray = Array.isArray(keywords) ? keywords : keywords.split(',').map((k: string) => k.trim()).filter((k: string) => k);
    
    const id = await filterRepo.createFilter({ categoryId: Number(categoryId), name: name.trim(), type: type || 'broad', keywords: keywordsArray });
    res.json({ success: true, message: 'Filtro criado', data: { id } });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      res.status(409).json({ success: false, message: 'Filtro já existe nesta categoria' });
    } else {
      res.status(500).json({ success: false, message: 'Erro ao criar filtro' });
    }
  }
};

export const updateFilter = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { name, type, keywords } = req.body;
    
    // Buscar filtro atual (1 query em vez de carregar todos)
    const currentFilter = await filterRepo.findFilterById(id);
    
    if (name && name.trim() !== '' && currentFilter) {
      const existing = await filterRepo.findFilterByNameAndCategory(name.trim(), currentFilter.category_id);
      if (existing && existing.id !== id) {
        res.status(409).json({ success: false, message: 'Já existe um filtro com esse nome nesta categoria' });
        return;
      }
    }
    
    const keywordsValue = Array.isArray(keywords) ? keywords : (keywords ? keywords.split(',').map((k: string) => k.trim()).filter((k: string) => k) : null);
    await filterRepo.updateFilter(id, { name: name?.trim(), type, keywords: keywordsValue });
    res.json({ success: true, message: 'Filtro atualizado' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao atualizar filtro' });
  }
};

export const toggle = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    await filterRepo.toggleFilter(id);
    res.json({ success: true, message: 'Status alterado' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao alterar status' });
  }
};

export const remove = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    await filterRepo.deleteFilter(id);
    res.json({ success: true, message: 'Filtro removido' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao remover filtro' });
  }
};

export const toggleAll = async (req: Request, res: Response): Promise<void> => {
  try {
    const { isActive } = req.body;
    await filterRepo.toggleAllFilters(isActive);
    res.json({ success: true, message: isActive ? 'Todos os filtros ativados' : 'Todos os filtros desativados' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao alterar filtros' });
  }
};

export const deleteCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    await filterRepo.deleteCategory(id);
    res.json({ success: true, message: 'Categoria removida' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao remover categoria' });
  }
};

export const getStats = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [active, total] = await Promise.all([
      filterRepo.getActiveFiltersCount(),
      filterRepo.getTotalFiltersCount(),
    ]);
    res.json({ success: true, data: { active, total } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao obter estatísticas' });
  }
};
