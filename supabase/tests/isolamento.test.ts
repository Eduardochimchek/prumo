// Testes de isolamento entre empresas (multi-tenant). Critério de pronto da Fase 1:
// um usuário da empresa A não lê nem grava NADA da empresa B, nem chamando o banco direto.

import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { como, criarBanco, recusa } from './banco';

const A = '00000000-0000-4000-8000-00000000000a'; // admin da Empresa A
const B = '00000000-0000-4000-8000-00000000000b'; // admin da Empresa B
const C = '00000000-0000-4000-8000-00000000000c'; // contador: consulta na A, financeiro na B
const D = '00000000-0000-4000-8000-00000000000d'; // logado, mas sem empresa nenhuma

let db: PGlite;
let EA = '';
let EB = '';
let contatoA = '';
let contaA = '';
let lancA = '';
let contatoB = '';
let contaB = '';
let lancB = '';

const um = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const todos = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

beforeAll(async () => {
  db = await criarBanco();
  await db.query(
    `insert into auth.users (id, email) values ($1, 'a@empresa-a.com'), ($2, 'b@empresa-b.com'), ($3, 'contador@escritorio.com'), ($4, 'd@x.com')`,
    [A, B, C, D],
  );

  await como(db, A, async () => {
    EA = (await um<{ id: string }>(`select criar_empresa('Empresa A Ltda', '11.222.333/0001-81') as id`))!.id;
    await db.query(`insert into membros (empresa_id, usuario_id, papel) values ($1, $2, 'leitura')`, [EA, C]);
    contatoA = (await um<{ id: string }>(`insert into contatos (empresa_id, tipo, nome) values ($1, 'fornecedor', 'Fornecedor da A') returning id`, [EA]))!.id;
    contaA = (await um<{ id: string }>(`insert into contas_bancarias (empresa_id, nome, tipo) values ($1, 'Banco da A', 'corrente') returning id`, [EA]))!.id;
    lancA = (await um<{ id: string }>(
      `insert into lancamentos (empresa_id, tipo, descricao, contato_id, conta_id, valor, vencimento, competencia, criado_por)
       values ($1, 'pagar', 'Aluguel da A', $2, $3, 680000, '2026-12-10', '2026-12', $4) returning id`,
      [EA, contatoA, contaA, A],
    ))!.id;
  });

  await como(db, B, async () => {
    EB = (await um<{ id: string }>(`select criar_empresa('Empresa B Ltda', '12.ABC.345/01DE-35') as id`))!.id;
    await db.query(`insert into membros (empresa_id, usuario_id, papel) values ($1, $2, 'financeiro')`, [EB, C]);
    contatoB = (await um<{ id: string }>(`insert into contatos (empresa_id, tipo, nome) values ($1, 'cliente', 'Cliente da B') returning id`, [EB]))!.id;
    contaB = (await um<{ id: string }>(`insert into contas_bancarias (empresa_id, nome, tipo) values ($1, 'Banco da B', 'corrente') returning id`, [EB]))!.id;
    lancB = (await um<{ id: string }>(
      `insert into lancamentos (empresa_id, tipo, descricao, contato_id, conta_id, valor, vencimento, competencia, criado_por)
       values ($1, 'receber', 'Venda da B', $2, $3, 150000, '2026-12-15', '2026-12', $4) returning id`,
      [EB, contatoB, contaB, B],
    ))!.id;
  });
}, 60_000);

describe('leitura isolada por empresa', () => {
  it('cada admin só vê a própria empresa e os próprios dados', async () => {
    await como(db, A, async () => {
      expect((await todos<{ id: string }>('select id from empresas')).map((e) => e.id)).toEqual([EA]);
      expect((await todos<{ descricao: string }>('select descricao from lancamentos')).map((l) => l.descricao)).toEqual(['Aluguel da A']);
      expect(await todos('select * from contatos where empresa_id = $1', [EB])).toHaveLength(0);
      expect(await todos('select * from lancamentos where id = $1', [lancB])).toHaveLength(0);
    });
  });

  it('o contador membro das duas vê as duas', async () => {
    await como(db, C, async () => {
      expect(await todos('select id from empresas')).toHaveLength(2);
      expect(await todos('select id from lancamentos')).toHaveLength(2);
    });
  });

  it('logado sem empresa não vê nada; sem login nem consegue consultar', async () => {
    await como(db, D, async () => {
      expect(await todos('select * from empresas')).toHaveLength(0);
      expect(await todos('select * from lancamentos')).toHaveLength(0);
      expect(await todos('select * from membros')).toHaveLength(0);
    });
    await como(db, null, async () => {
      expect(await recusa(db.query('select * from lancamentos'))).toMatch(/permission denied/);
      expect(await recusa(db.query('select * from empresas'))).toMatch(/permission denied/);
    });
  });
});

describe('escrita isolada por empresa', () => {
  it('A não grava na empresa B', async () => {
    await como(db, A, async () => {
      const msg = await recusa(
        db.query(`insert into lancamentos (empresa_id, tipo, descricao, valor, vencimento, competencia) values ($1, 'pagar', 'invasão', 100, '2026-12-01', '2026-12')`, [EB]),
      );
      expect(msg).toMatch(/row-level security/);
    });
  });

  it('A não altera nem apaga linhas da B (0 linhas afetadas)', async () => {
    await como(db, A, async () => {
      expect((await db.query('update lancamentos set valor = 1 where id = $1', [lancB])).affectedRows).toBe(0);
      expect((await db.query('delete from lancamentos where id = $1', [lancB])).affectedRows).toBe(0);
      expect((await db.query('update empresas set razao_social = $2 where id = $1', [EB, 'hack'])).affectedRows).toBe(0);
    });
    const ainda = await um<{ valor: string }>('select valor from lancamentos where id = $1', [lancB]);
    expect(Number(ainda!.valor)).toBe(150000);
  });

  it('não dá para apontar para o contato ou a conta de outra empresa', async () => {
    await como(db, A, async () => {
      const msg = await recusa(
        db.query(
          `insert into lancamentos (empresa_id, tipo, descricao, contato_id, valor, vencimento, competencia) values ($1, 'pagar', 'x', $2, 100, '2026-12-01', '2026-12')`,
          [EA, contatoB],
        ),
      );
      expect(msg).toMatch(/foreign key/);
      const msg2 = await recusa(db.query(`insert into baixas (empresa_id, lancamento_id, data, valor_pago, conta_id) values ($1, $2, '2026-12-10', 680000, $3)`, [EA, lancA, contaB]));
      expect(msg2).toMatch(/foreign key/);
    });
  });

  it('quem é membro das duas não move um registro de uma empresa para a outra', async () => {
    await como(db, C, async () => {
      const msg = await recusa(db.query('update lancamentos set empresa_id = $1 where id = $2', [EA, lancB]));
      expect(msg).toMatch(/mudar a empresa|row-level security/);
    });
  });
});

describe('papéis', () => {
  it('consulta lê mas não grava; financeiro grava', async () => {
    await como(db, C, async () => {
      // na A o contador é "leitura"
      expect(
        await recusa(db.query(`insert into contatos (empresa_id, tipo, nome) values ($1, 'cliente', 'Tentativa')`, [EA])),
      ).toMatch(/row-level security/);
      expect((await db.query('update lancamentos set valor = 1 where id = $1', [lancA])).affectedRows).toBe(0);
      // na B ele é "financeiro"
      const ok = await um<{ id: string }>(`insert into baixas (empresa_id, lancamento_id, data, valor_pago, conta_id, usuario_id) values ($1, $2, '2026-12-15', 150000, $3, $4) returning id`, [EB, lancB, contaB, C]);
      expect(ok!.id).toBeTruthy();
      // mas contas bancárias e categorias são só do administrador
      expect(await recusa(db.query(`insert into categorias (empresa_id, nome, tipo) values ($1, 'Nova', 'despesa')`, [EB]))).toMatch(/row-level security/);
    });
  });

  it('ninguém se coloca sozinho em outra empresa nem se promove', async () => {
    await como(db, A, async () => {
      expect(await recusa(db.query(`insert into membros (empresa_id, usuario_id, papel) values ($1, $2, 'admin')`, [EB, A]))).toMatch(/row-level security/);
    });
    await como(db, C, async () => {
      expect((await db.query(`update membros set papel = 'admin' where empresa_id = $1 and usuario_id = $2`, [EA, C])).affectedRows).toBe(0);
    });
  });

  it('a empresa nunca fica sem administrador', async () => {
    await como(db, A, async () => {
      expect(await recusa(db.query(`update membros set papel = 'financeiro' where empresa_id = $1 and usuario_id = $2`, [EA, A]))).toMatch(/administrador/);
      expect(await recusa(db.query(`delete from membros where empresa_id = $1 and usuario_id = $2`, [EA, A]))).toMatch(/administrador/);
    });
  });
});

describe('convites', () => {
  it('só o e-mail convidado aceita, uma vez, dentro do prazo', async () => {
    const token = 'token-secreto-de-teste-123';
    await como(db, A, async () => {
      await db.query(
        `insert into convites (empresa_id, email, papel, token_hash, criado_por) values ($1, 'd@x.com', 'financeiro', encode(sha256(convert_to($2, 'UTF8')), 'hex'), $3)`,
        [EA, token, A],
      );
    });
    await como(db, B, async () => {
      expect(await recusa(db.query('select aceitar_convite($1)', [token]))).toMatch(/outro e-mail/);
    });
    await como(db, D, async () => {
      expect(await recusa(db.query('select aceitar_convite($1)', ['token-errado']))).toMatch(/inválido/);
      expect((await um<{ e: string }>('select aceitar_convite($1) as e', [token]))!.e).toBe(EA);
      expect(await todos('select id from lancamentos')).toHaveLength(1);
      expect(await recusa(db.query('select aceitar_convite($1)', [token]))).toMatch(/inválido/);
    });
  });

  it('o convite em si (com o hash) só é visto pelo administrador da empresa', async () => {
    await como(db, B, async () => {
      expect(await todos('select * from convites')).toHaveLength(0);
    });
  });
});

describe('auditoria', () => {
  it('registra quem fez o quê, e cada admin só vê a auditoria da sua empresa', async () => {
    await como(db, A, async () => {
      await db.query('update lancamentos set valor = 700000 where id = $1', [lancA]);
      const linhas = await todos<{ tabela: string; operacao: string; usuario_id: string; empresa_id: string }>(
        `select tabela, operacao, usuario_id, empresa_id from auditoria where registro_id = $1 order by id`,
        [lancA],
      );
      expect(linhas.map((l) => l.operacao)).toEqual(['INSERT', 'UPDATE']);
      expect(linhas.every((l) => l.usuario_id === A && l.empresa_id === EA)).toBe(true);
      expect(await todos('select * from auditoria where empresa_id = $1', [EB])).toHaveLength(0);
      expect(await recusa(db.query(`insert into auditoria (tabela, operacao) values ('x', 'y')`))).toMatch(/permission denied/);
      expect(await recusa(db.query('delete from auditoria'))).toMatch(/permission denied/);
    });
  });
});

describe('trava contra tabela esquecida sem proteção', () => {
  it('toda tabela do schema public tem RLS ligado e nenhuma libera acesso ao anon', async () => {
    const semRls = await todos<{ tabela: string }>(
      `select c.relname as tabela from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(semRls.map((t) => t.tabela)).toEqual([]);
    const anon = await todos<{ tabela: string }>(
      `select table_name as tabela from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'`,
    );
    expect(anon).toEqual([]);
  });

  it('toda tabela com empresa_id tem política de leitura por empresa', async () => {
    const semPolitica = await todos<{ tabela: string }>(
      `select c.table_name as tabela from information_schema.columns c
       where c.table_schema = 'public' and c.column_name = 'empresa_id' and c.table_name <> 'auditoria'
         and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.table_name and p.cmd in ('SELECT', 'ALL') and (p.qual like '%tem_acesso(empresa_id)%' or p.qual like '%tem_papel(empresa_id%'))`,
    );
    expect(semPolitica.map((t) => t.tabela)).toEqual([]);
  });
});
