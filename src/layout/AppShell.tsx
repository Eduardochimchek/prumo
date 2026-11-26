// Estrutura das telas internas. Desktop: cabeçalho como um jornal, com a marca, as abas dos módulos
// (Início, Comercial, Faturamento, Financeiro) e, embaixo, as telas do módulo aberto.
// Cada login vê só os módulos dele (auth/modulos.ts); o administrador vê todos e troca com um clique.
// Celular: barra superior compacta + barra inferior com o botão de lançar no centro.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth, useUsuario, NOME_PAPEL } from '../auth/auth';
import { moduloDaRota, NOME_MODULO, PAGINAS_DO_MODULO, podeAbrir, rotaInicial, vejoInicio, type Modulo } from '../auth/modulos';
import { useDb } from '../data/store';
import { briefing } from '../data/selectors';
import { useTema, type Tema } from '../lib/tema';
import { Icone, type NomeIcone } from '../components/Icone';
import { Marca, MarcaSimbolo } from '../components/Marca';
import { Avatar, Botao, ItemMenu, MenuSuspenso, Vazio } from '../components/ui';
import { Camada } from '../components/Camada';
import { useAcoes } from '../components/Acoes';

const CHAVE_MODULO = 'prumo:modulo';

function lerModulo(): Modulo | null {
  try {
    return (sessionStorage.getItem(CHAVE_MODULO) as Modulo | null) ?? null;
  } catch {
    return null;
  }
}

function gravarModulo(m: Modulo) {
  try {
    sessionStorage.setItem(CHAVE_MODULO, m);
  } catch {
    /* sem armazenamento: o módulo vale só até recarregar */
  }
}

function SemAcesso({ inicio }: { inicio: string }) {
  return (
    <Vazio
      icone="cadeado"
      titulo="Esta tela é de outro módulo"
      texto="O seu acesso não inclui este módulo. Se precisar, peça ao administrador para marcar o módulo no seu usuário."
      acao={
        <Link to={inicio} className="btn btn--secundario">
          Voltar para o meu início
        </Link>
      }
    />
  );
}

interface ItemNav {
  rota: string;
  rotulo: string;
  icone: NomeIcone;
  contagem?: number;
  alerta?: boolean;
}

function SeletorTema({ tema, setTema }: { tema: Tema; setTema: (t: Tema) => void }) {
  return (
    <div className="segmentado" role="group" aria-label="Tema">
      {(
        [
          ['claro', 'sol', 'Claro'],
          ['escuro', 'lua', 'Escuro'],
          ['sistema', 'grade', 'Auto'],
        ] as const
      ).map(([v, i, r]) => (
        <button key={v} type="button" aria-pressed={tema === v} onClick={() => setTema(v)}>
          <Icone nome={i} tam={15} /> {r}
        </button>
      ))}
    </div>
  );
}

function ItemRodape({ i }: { i: ItemNav }) {
  return (
    <NavLink to={i.rota} end={i.rota === '/'} className="nav-movel__item">
      <Icone nome={i.icone} tam={22} />
      <span>{i.rotulo}</span>
      {i.alerta && <i className="nav-movel__ponto" aria-label="há contas vencidas" />}
    </NavLink>
  );
}

export function AppShell() {
  const db = useDb();
  const usuario = useUsuario();
  const { sair, pode, modulos } = useAuth();
  const acoes = useAcoes();
  const navegar = useNavigate();
  const local = useLocation();
  const [tema, setTema] = useTema();
  const [mais, setMais] = useState(false);
  const [lancar, setLancar] = useState(false);

  const b = useMemo(() => briefing(db), [db]);
  const inicio = vejoInicio(usuario);
  const minhaEntrada = rotaInicial(usuario);
  const liberado = podeAbrir(usuario, local.pathname);

  // módulo aberto: vem da rota; telas comuns a vários módulos (Contatos, Vendas, Relatórios) ficam no último
  // o clique numa aba leva o módulo junto com a navegação (no state do histórico): assim a troca de módulo e a
  // de endereço chegam juntas, e voltar/avançar no navegador devolve o módulo de cada tela
  const [ultimoModulo, setUltimoModulo] = useState<Modulo | null>(lerModulo);
  const pedidoPeloLink = (local.state as { modulo?: Modulo } | null)?.modulo ?? null;
  const moduloAtual = moduloDaRota(usuario, local.pathname, local.search, pedidoPeloLink ?? ultimoModulo, pedidoPeloLink !== null);
  useEffect(() => {
    if (moduloAtual && moduloAtual !== ultimoModulo) {
      setUltimoModulo(moduloAtual);
      gravarModulo(moduloAtual);
    }
  }, [moduloAtual, ultimoModulo]);

  const pedidos = db.vendas.filter((v) => v.etapa === 'pedido').length || undefined;
  const contagens: Record<string, Pick<ItemNav, 'contagem' | 'alerta'>> = {
    '/vendas': { contagem: pedidos },
    '/vendas?aba=pedido': { contagem: pedidos },
    '/contas/pagar': { contagem: b.pagar.vencido.qtd + b.pagar.hoje.qtd || undefined, alerta: b.pagar.vencido.qtd > 0 },
    '/contas/receber': { contagem: b.receber.vencido.qtd || undefined, alerta: b.receber.vencido.qtd > 0 },
    '/notas': { contagem: b.sefazPendentes.length + b.notasSemTitulo.length || undefined },
  };
  const paginasDe = (m: Modulo): ItemNav[] => PAGINAS_DO_MODULO[m].map((p) => ({ ...p, ...contagens[p.rota] }));
  const itens: ItemNav[] = moduloAtual ? paginasDe(moduloAtual) : [];
  const admin: ItemNav[] = [
    ...(pode('usuarios') ? [{ rota: '/usuarios', rotulo: 'Usuários', icone: 'usuarios' as const }] : []),
    { rota: '/configuracoes', rotulo: 'Configurações', icone: 'ajustes' },
  ];
  const ativo = (rota: string) => {
    const caminho = rota.split('?')[0];
    return local.pathname === caminho || local.pathname.startsWith(caminho + '/');
  };
  const tituloAtual = local.pathname === '/' ? 'Início' : [...itens, ...modulos.flatMap(paginasDe), ...admin].find((i) => ativo(i.rota))?.rotulo ?? 'Prumo';
  // com um módulo só e sem o painel do dono, as abas não fazem sentido: o nome do módulo vai na linha das telas
  const comAbas = modulos.length > 1 || inicio;

  const podeLancarAlgo = pode('vender') || pode('lancar') || pode('importar') || pode('planilha');
  // barra de baixo do celular: Início (se houver) e as primeiras telas do módulo aberto
  const vagas = podeLancarAlgo ? 3 : 4;
  const doModulo = (moduloAtual ? itens : modulos[0] ? paginasDe(modulos[0]) : []).filter((i) => !i.rota.startsWith('/relatorios'));
  const semContatos = doModulo.filter((i) => i.rota !== '/contatos');
  const rodape: ItemNav[] = [
    ...(inicio ? [{ rota: '/', rotulo: 'Início', icone: 'hoje' as const }] : []),
    // Contatos entra só se sobrar lugar (ex.: vendedor: Vendas, Produtos, Clientes)
    ...((inicio ? 1 : 0) + semContatos.length >= vagas ? semContatos : doModulo),
  ];
  const rodapeEsq = rodape.slice(0, 2);
  const rodapeDir = rodape.slice(2, podeLancarAlgo ? 3 : 4);

  const menuUsuario = (
    <MenuSuspenso
      rotulo="Conta"
      gatilho={(abrir, aberto) => (
        <button type="button" className="barra__usuario" onClick={abrir} aria-expanded={aberto} aria-label={`Conta de ${usuario.nome}`}>
          <Avatar nome={usuario.nome} />
        </button>
      )}
    >
      {(fechar) => (
        <>
          <div className="menu__cabeca">
            <strong>{usuario.nome}</strong>
            <div className="muted" style={{ fontSize: 13 }}>
              {usuario.email}
            </div>
            <span className="carimbo carimbo--aberto" style={{ marginTop: 8 }}>
              {NOME_PAPEL[usuario.papel]}
            </span>
          </div>
          <div className="menu__sep" />
          <div style={{ padding: '4px 6px 8px' }}>
            <SeletorTema tema={tema} setTema={setTema} />
          </div>
          <ItemMenu icone="usuario" onClick={() => { fechar(); navegar('/configuracoes?aba=perfil'); }}>
            Meu perfil e senha
          </ItemMenu>
          {pode('usuarios') && (
            <ItemMenu icone="usuarios" onClick={() => { fechar(); navegar('/usuarios'); }}>
              Usuários e acessos
            </ItemMenu>
          )}
          <ItemMenu icone="ajustes" onClick={() => { fechar(); navegar('/configuracoes'); }}>
            Configurações
          </ItemMenu>
          <div className="menu__sep" />
          <ItemMenu icone="sair" onClick={() => { fechar(); sair(); }}>
            Sair
          </ItemMenu>
        </>
      )}
    </MenuSuspenso>
  );

  const opcoesLancar = (fechar: () => void): ReactNode => (
    <>
      {pode('vender') && (
        <ItemMenu icone="venda" onClick={() => { fechar(); acoes.novoOrcamento(); }}>
          Orçamento
        </ItemMenu>
      )}
      {pode('lancar') && (
        <>
          <ItemMenu icone="pagar" onClick={() => { fechar(); acoes.novoLancamento({ tipo: 'pagar' }); }}>
            Conta a pagar
          </ItemMenu>
          <ItemMenu icone="receber" onClick={() => { fechar(); acoes.novoLancamento({ tipo: 'receber' }); }}>
            Conta a receber
          </ItemMenu>
        </>
      )}
      {pode('importar') && (
        <ItemMenu icone="enviar" onClick={() => { fechar(); acoes.importarNotas(); }}>
          Importar XML de nota
        </ItemMenu>
      )}
      {pode('planilha') && (
        <ItemMenu icone="planilha" onClick={() => { fechar(); acoes.importarPlanilha(); }}>
          Importar planilha
        </ItemMenu>
      )}
      {pode('contatos') && (
        <ItemMenu icone="contatos" onClick={() => { fechar(); acoes.novoContato(); }}>
          Cliente ou fornecedor
        </ItemMenu>
      )}
    </>
  );

  const linksAdmin = (
    <div className="secoes__lista secoes__lista--admin">
      {admin.map((i) => (
        <NavLink key={i.rota} to={i.rota} className="secoes__item">
          {i.rotulo}
        </NavLink>
      ))}
    </div>
  );

  return (
    <div className="app">
      <a className="pular" href="#conteudo">
        Pular para o conteúdo
      </a>

      {/* ---------- Desktop ---------- */}
      <header className="cabecalho nao-imprimir">
        <div className="barra">
          <div className="barra__esq">
            <NavLink to={minhaEntrada} className="barra__marca" aria-label="Prumo, início">
              <Marca />
            </NavLink>
            <span className="barra__empresa" title={`CNPJ ${db.empresa.cnpj}`}>
              {db.empresa.nomeFantasia}
            </span>
            {db.demo && (
              <span className="carimbo carimbo--latao" title="Dados fictícios para demonstração. Em Configurações você zera e começa a usar de verdade.">
                Demonstração
              </span>
            )}
          </div>
          <div className="barra__dir">
            <button type="button" className="barra__busca" onClick={acoes.abrirPaleta}>
              <Icone nome="busca" tam={16} />
              <span>Buscar ou executar…</span>
              <span className="kbd">Ctrl K</span>
            </button>
            {podeLancarAlgo && (
              <MenuSuspenso rotulo="Lançar" gatilho={(abrir) => <Botao variante="primario" icone="mais" onClick={abrir}>Lançar</Botao>}>
                {opcoesLancar}
              </MenuSuspenso>
            )}
            {menuUsuario}
          </div>
        </div>
        {comAbas && (
          <nav className="modulos" aria-label="Módulos">
            <div className="modulos__lista">
              {inicio && (
                <NavLink to="/" end className="modulos__item">
                  Início
                </NavLink>
              )}
              {modulos.map((m) => (
                <Link
                  key={m}
                  to={PAGINAS_DO_MODULO[m][0].rota}
                  className={`modulos__item${moduloAtual === m ? ' active' : ''}`}
                  state={{ modulo: m }}
                  aria-current={moduloAtual === m ? 'true' : undefined}
                >
                  {NOME_MODULO[m]}
                  {paginasDe(m).some((i) => i.alerta) && <i className="modulos__ponto" aria-label="tem conta vencida" />}
                </Link>
              ))}
            </div>
            {linksAdmin}
          </nav>
        )}
        {(itens.length > 0 || !comAbas) && (
          <nav className="secoes" aria-label={moduloAtual ? `Telas do ${NOME_MODULO[moduloAtual]}` : 'Seções'}>
            <div className="secoes__lista">
              {!comAbas && moduloAtual && <span className="secoes__modulo">{NOME_MODULO[moduloAtual]}</span>}
              {itens.map((i) => (
                <NavLink key={i.rota} to={i.rota} state={moduloAtual ? { modulo: moduloAtual } : undefined} className="secoes__item">
                  {i.rotulo}
                  {i.contagem ? <span className={`secoes__contagem${i.alerta ? ' secoes__contagem--alerta' : ''}`}>{i.contagem}</span> : null}
                </NavLink>
              ))}
            </div>
            {!comAbas && linksAdmin}
          </nav>
        )}
      </header>

      {/* ---------- Celular ---------- */}
      <header className="topo-movel nao-imprimir">
        <NavLink to={minhaEntrada} aria-label="Prumo, início" className="topo-movel__marca">
          <MarcaSimbolo tam={22} />
        </NavLink>
        <span className="topo-movel__titulo">
          {moduloAtual && local.pathname !== '/' && <small>{NOME_MODULO[moduloAtual]}</small>}
          {tituloAtual}
        </span>
        <button type="button" className="btn btn--fantasma btn--icone" onClick={acoes.abrirPaleta} aria-label="Buscar">
          <Icone nome="busca" />
        </button>
        {menuUsuario}
      </header>

      <main id="conteudo" className="conteudo">
        {db.demo && (
          <div className="faixa-demo nao-imprimir">
            Dados de demonstração. Explore à vontade; em <NavLink to="/configuracoes?aba=dados">Configurações → Dados</NavLink> você zera tudo e começa de verdade.
          </div>
        )}
        {local.pathname === '/' && !inicio ? <Navigate to={minhaEntrada} replace /> : liberado ? <Outlet /> : <SemAcesso inicio={minhaEntrada} />}
      </main>

      <nav className="nav-movel nao-imprimir" aria-label="Navegação principal">
        {rodapeEsq.map((i) => (
          <ItemRodape key={i.rota} i={i} />
        ))}
        {podeLancarAlgo && (
          <button type="button" className="nav-movel__lancar" onClick={() => setLancar(true)} aria-label="Lançar">
            <Icone nome="mais" tam={26} traco={2} />
          </button>
        )}
        {rodapeDir.map((i) => (
          <ItemRodape key={i.rota} i={i} />
        ))}
        <button type="button" className={`nav-movel__item${mais ? ' active' : ''}`} onClick={() => setMais(true)}>
          <Icone nome="menu" tam={22} />
          <span>Mais</span>
        </button>
      </nav>

      <Camada aberta={mais} aoFechar={() => setMais(false)} titulo="Menu" sobretitulo={db.empresa.nomeFantasia} tipo="gaveta">
        <div className="mais__usuario">
          <Avatar nome={usuario.nome} tam="g" />
          <div>
            <strong>{usuario.nome}</strong>
            <div className="muted" style={{ fontSize: 13 }}>
              {NOME_PAPEL[usuario.papel]} · {usuario.email}
            </div>
          </div>
        </div>
        {inicio && (
          <nav className="mais__lista" aria-label="Início">
            <NavLink to="/" end className="mais__item" onClick={() => setMais(false)}>
              <Icone nome="hoje" />
              <span>Início</span>
              <Icone nome="direita" tam={16} />
            </NavLink>
          </nav>
        )}
        {modulos.map((m) => (
          <nav key={m} className="mais__lista" aria-label={NOME_MODULO[m]}>
            <span className="rotulo mais__modulo">{NOME_MODULO[m]}</span>
            {paginasDe(m).map((i) => (
              <Link
                key={i.rota}
                to={i.rota}
                state={{ modulo: m }}
                className={`mais__item${moduloAtual === m && ativo(i.rota) ? ' active' : ''}`}
                onClick={() => setMais(false)}
              >
                <Icone nome={i.icone} />
                <span>{i.rotulo}</span>
                {i.contagem ? <span className={`secoes__contagem${i.alerta ? ' secoes__contagem--alerta' : ''}`}>{i.contagem}</span> : null}
                <Icone nome="direita" tam={16} />
              </Link>
            ))}
          </nav>
        ))}
        <nav className="mais__lista" aria-label="Conta e empresa">
          <span className="rotulo mais__modulo">Conta e empresa</span>
          {admin.map((i) => (
            <NavLink key={i.rota} to={i.rota} className="mais__item" onClick={() => setMais(false)}>
              <Icone nome={i.icone} />
              <span>{i.rotulo}</span>
              <Icone nome="direita" tam={16} />
            </NavLink>
          ))}
        </nav>
        <div style={{ marginTop: 18 }}>
          <span className="rotulo">Tema</span>
          <div style={{ marginTop: 8 }}>
            <SeletorTema tema={tema} setTema={setTema} />
          </div>
        </div>
        <Botao bloco icone="sair" style={{ marginTop: 22 }} onClick={() => { setMais(false); sair(); }}>
          Sair
        </Botao>
      </Camada>

      <Camada aberta={lancar} aoFechar={() => setLancar(false)} titulo="O que você quer lançar?" tipo="modal">
        <div className="lancar-grade">
          {(
            [
              ['venda', 'Orçamento', 'Vira pedido, nota e boleto', () => acoes.novoOrcamento(), pode('vender')],
              ['pagar', 'Conta a pagar', 'Boleto, aluguel, fornecedor…', () => acoes.novoLancamento({ tipo: 'pagar' }), pode('lancar')],
              ['receber', 'Conta a receber', 'Venda, serviço, parcela…', () => acoes.novoLancamento({ tipo: 'receber' }), pode('lancar')],
              ['enviar', 'Importar nota (XML)', 'Gera as contas pelas duplicatas', () => acoes.importarNotas(), pode('importar')],
              ['planilha', 'Importar planilha', 'Traz as contas do Excel', () => acoes.importarPlanilha(), pode('planilha')],
              ['contatos', 'Cliente ou fornecedor', 'Busca o CNPJ na Receita', () => acoes.novoContato(), pode('contatos')],
            ] as const
          )
            .filter((o) => o[4])
            .map(([icone, titulo, texto, fn]) => (
              <button
                key={titulo}
                type="button"
                className="lancar-opcao"
                onClick={() => {
                  setLancar(false);
                  fn();
                }}
              >
                <Icone nome={icone} tam={22} />
                <strong>{titulo}</strong>
                <span>{texto}</span>
              </button>
            ))}
        </div>
      </Camada>
    </div>
  );
}
