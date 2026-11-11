import { describe, expect, it } from 'vitest';
import {
  CONTAS_DEMONSTRACAO,
  USUARIOS_DEMONSTRACAO,
  cirurgiasCadastradas,
  coresDasCategorias,
  coresDosPapeis,
  historicoDeConferencias,
  itensDeEstoqueDemonstracao,
  kitsPorCirurgia,
  rotulosDosPapeis,
  usuariosAplicacao,
} from '@/data/mockData';
import type { UserRole } from '@/data/mockData';

const todosOsPapeis: UserRole[] = ['admin', 'nurse', 'technician'];

describe('dados de demonstração', () => {
  describe('perfis de acesso (RF01)', () => {
    it('há uma conta de demonstração para cada perfil', () => {
      expect(CONTAS_DEMONSTRACAO.map((conta) => conta.role).sort()).toEqual([...todosOsPapeis].sort());
    });

    it.each(CONTAS_DEMONSTRACAO)('a conta $email possui um usuário correspondente com o mesmo perfil', (conta) => {
      const usuario = USUARIOS_DEMONSTRACAO[conta.email];
      expect(usuario).toBeDefined();
      expect(usuario.email).toBe(conta.email);
      expect(usuario.role).toBe(conta.role);
    });

    it('todos os perfis possuem rótulo e cores definidos', () => {
      for (const papel of todosOsPapeis) {
        expect(rotulosDosPapeis[papel]).toBeTruthy();
        expect(coresDosPapeis[papel].fundo).toMatch(/^#[0-9A-F]{6}$/i);
        expect(coresDosPapeis[papel].texto).toMatch(/^#[0-9A-F]{6}$/i);
      }
    });

    it('os e-mails e IDs de usuários da lista administrativa são únicos', () => {
      expect(new Set(usuariosAplicacao.map((u) => u.email)).size).toBe(usuariosAplicacao.length);
      expect(new Set(usuariosAplicacao.map((u) => u.id)).size).toBe(usuariosAplicacao.length);
    });

    it('as contas de demonstração existem na lista administrativa de usuários', () => {
      for (const conta of CONTAS_DEMONSTRACAO) {
        expect(usuariosAplicacao.some((u) => u.email === conta.email && u.role === conta.role)).toBe(true);
      }
    });
  });

  describe('cirurgias e kits (RF02–RF04)', () => {
    it('IDs de cirurgia são únicos', () => {
      expect(new Set(cirurgiasCadastradas.map((c) => c.id)).size).toBe(cirurgiasCadastradas.length);
    });

    it('toda cirurgia cadastrada possui um kit (checklist padrão) e todo kit pertence a uma cirurgia', () => {
      expect(Object.keys(kitsPorCirurgia).sort()).toEqual(cirurgiasCadastradas.map((c) => c.id).sort());
    });

    it.each(Object.entries(kitsPorCirurgia))('o kit "%s" não está vazio e tem itens válidos', (_id, itens) => {
      expect(itens.length).toBeGreaterThan(0);
      expect(new Set(itens.map((i) => i.id)).size).toBe(itens.length);
      for (const item of itens) {
        expect(item.name.trim()).not.toBe('');
        expect(item.quantity).toBeGreaterThan(0);
        expect(Number.isInteger(item.quantity)).toBe(true);
        expect(coresDasCategorias[item.category]).toBeDefined();
      }
    });

    it('todo kit possui pelo menos um item crítico', () => {
      for (const itens of Object.values(kitsPorCirurgia)) {
        expect(itens.some((i) => i.critical)).toBe(true);
      }
    });
  });

  describe('estoque', () => {
    it('IDs de estoque são únicos e as quantidades não são negativas', () => {
      expect(new Set(itensDeEstoqueDemonstracao.map((i) => i.id)).size).toBe(itensDeEstoqueDemonstracao.length);
      for (const item of itensDeEstoqueDemonstracao) {
        expect(item.available).toBeGreaterThanOrEqual(0);
        expect(item.minimum).toBeGreaterThan(0);
      }
    });

    it('itens "ok" estão em ou acima do mínimo; itens "low" e "critical" estão abaixo dele', () => {
      for (const item of itensDeEstoqueDemonstracao) {
        if (item.status === 'ok') expect(item.available, item.name).toBeGreaterThanOrEqual(item.minimum);
        else expect(item.available, item.name).toBeLessThan(item.minimum);
      }
    });

    it('há exemplos de cada status para a demonstração', () => {
      const status = new Set(itensDeEstoqueDemonstracao.map((i) => i.status));
      expect([...status].sort()).toEqual(['critical', 'low', 'ok']);
    });
  });

  describe('histórico de conferências (RF08, RF09)', () => {
    it.each(historicoDeConferencias)('o relatório $id tem contagens coerentes com seus itens', (relatorio) => {
      const confirmados = relatorio.items.filter((i) => i.status === 'confirmed').length;
      const faltantes = relatorio.items.filter((i) => i.status === 'missing').length;

      expect(relatorio.confirmed).toBe(confirmados);
      expect(relatorio.missing).toBe(faltantes);
      expect(relatorio.total).toBe(relatorio.items.length);
      expect(relatorio.confirmed + relatorio.missing).toBe(relatorio.total);
    });

    it.each(historicoDeConferencias)('o relatório $id sinaliza divergência se, e somente se, houver item faltante (RN04)', (relatorio) => {
      expect(relatorio.status).toBe(relatorio.missing > 0 ? 'divergencia' : 'ok');
    });

    it.each(historicoDeConferencias)('o relatório $id corresponde ao kit da cirurgia "$surgeryId"', (relatorio) => {
      const cirurgia = cirurgiasCadastradas.find((c) => c.id === relatorio.surgeryId);
      expect(cirurgia?.name).toBe(relatorio.surgeryName);
      expect(cirurgia?.specialty).toBe(relatorio.specialty);
      expect(relatorio.items.map((i) => i.id).sort()).toEqual(kitsPorCirurgia[relatorio.surgeryId].map((i) => i.id).sort());
    });

    it('datas seguem dd/MM/yyyy e horários de itens seguem HH:mm:ss (contrato da API)', () => {
      for (const relatorio of historicoDeConferencias) {
        expect(relatorio.date).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        for (const item of relatorio.items) {
          if (item.confirmedAt) expect(item.confirmedAt).toMatch(/^\d{2}:\d{2}:\d{2}$/);
        }
      }
    });
  });
});
