import { HashRouter, Link, Route, Routes, useLocation } from 'react-router';
import { ProvedorAuth, useAuth } from './auth/auth';
import { ProvedorAvisos } from './components/Avisos';
import { ProvedorAcoes } from './components/Acoes';
import { AppShell } from './layout/AppShell';
import { Login } from './pages/Login';
import { Hoje } from './pages/Hoje';
import { Contas } from './pages/Contas';
import { Notas } from './pages/Notas';
import { NotaDetalhe } from './pages/NotaDetalhe';
import { Vendas } from './pages/Vendas';
import { VendaDetalhe } from './pages/VendaDetalhe';
import { Produtos } from './pages/Produtos';
import { Fluxo } from './pages/Fluxo';
import { Contatos } from './pages/Contatos';
import { Relatorios } from './pages/Relatorios';
import { Usuarios } from './pages/Usuarios';
import { Configuracoes } from './pages/Configuracoes';
import { Vazio } from './components/ui';
import { Privacidade } from './pages/Privacidade';
import { ErroLimite } from './components/ErroLimite';
import { AvisoPrivacidade, TrocarSenhaObrigatoria } from './components/TelasObrigatorias';

function NaoEncontrado() {
  return (
    <Vazio
      icone="prumo"
      titulo="Página fora de prumo"
      texto="O endereço não existe (ou mudou de lugar)."
      acao={
        <Link to="/" className="btn btn--secundario">
          Voltar para Hoje
        </Link>
      }
    />
  );
}

function Rotas() {
  const { usuario } = useAuth();
  const { pathname } = useLocation();
  // aviso de privacidade é público (link na tela de entrada)
  if (pathname === '/privacidade' && (!usuario || !usuario.aceitouPrivacidadeEm || usuario.trocarSenha)) return <Privacidade publica />;
  if (!usuario) return <Login />;
  if (usuario.trocarSenha) return <TrocarSenhaObrigatoria />;
  if (!usuario.aceitouPrivacidadeEm) return <AvisoPrivacidade />;
  return (
    <ProvedorAcoes>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Hoje />} />
          <Route path="contas/:tipo" element={<Contas />} />
          <Route path="vendas" element={<Vendas />} />
          <Route path="vendas/:id" element={<VendaDetalhe />} />
          <Route path="produtos" element={<Produtos />} />
          <Route path="notas" element={<Notas />} />
          <Route path="notas/:id" element={<NotaDetalhe />} />
          <Route path="fluxo" element={<Fluxo />} />
          <Route path="contatos" element={<Contatos />} />
          <Route path="relatorios" element={<Relatorios />} />
          <Route path="usuarios" element={<Usuarios />} />
          <Route path="configuracoes" element={<Configuracoes />} />
          <Route path="privacidade" element={<Privacidade />} />
          <Route path="*" element={<NaoEncontrado />} />
        </Route>
      </Routes>
    </ProvedorAcoes>
  );
}

// HashRouter: funciona em qualquer hospedagem estática (GitHub Pages) sem configurar o servidor.
export function App() {
  return (
    <HashRouter>
      <ProvedorAvisos>
        <ProvedorAuth>
          <ErroLimite>
            <Rotas />
          </ErroLimite>
        </ProvedorAuth>
      </ProvedorAvisos>
    </HashRouter>
  );
}
