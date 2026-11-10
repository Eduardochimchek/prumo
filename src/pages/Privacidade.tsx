// Aviso de privacidade (LGPD, art. 9º: informação clara sobre o tratamento) e termos de uso da V1.
// Acessível sem login (link na tela de entrada) e dentro do sistema.

import { Link } from 'react-router';
import { Marca } from '../components/Marca';
import { useAuth } from '../auth/auth';
import { useDb } from '../data/store';
import { mascaraCnpj } from '../lib/br';

export function Privacidade({ publica = false }: { publica?: boolean }) {
  const { usuario } = useAuth();
  const db = useDb();
  return (
    <div className={publica ? 'privacidade privacidade--publica' : 'privacidade'}>
      {publica && (
        <header className="privacidade__topo">
          <Link to="/" aria-label="Voltar para a entrada">
            <Marca />
          </Link>
          <Link to="/" className="btn btn--secundario btn--p">
            {usuario ? 'Voltar' : 'Entrar'}
          </Link>
        </header>
      )}
      <article className="privacidade__texto">
        <p className="rotulo">Privacidade e termos · versão 0.1 · novembro de 2026</p>
        <h1>Como o Prumo cuida dos seus dados</h1>
        <p className="lede">
          Resumo em uma frase: nesta versão, <strong>tudo fica no seu navegador</strong>. O Prumo não tem servidor, não usa cookies de rastreamento, não tem
          anúncios e não vende nem compartilha dados.
        </p>

        <h2>Quem é o responsável</h2>
        <p>
          A empresa que usa o Prumo ({db.empresa.razaoSocial}, CNPJ {mascaraCnpj(db.empresa.cnpj)}) é a <strong>controladora</strong> dos dados que lança no
          sistema (clientes, fornecedores, usuários). O Prumo é a ferramenta. Para exercer seus direitos, fale com o administrador do sistema na sua empresa.
        </p>

        <h2>Quais dados o sistema guarda e por quê</h2>
        <table className="razao privacidade__tabela">
          <thead>
            <tr>
              <th>Dado</th>
              <th>Para quê</th>
              <th>Base legal (LGPD)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Usuários: nome, e-mail, login, cargo, telefone, senha (só o hash)</td>
              <td>Dar acesso, saber quem fez cada lançamento</td>
              <td>Execução de contrato e legítimo interesse (art. 7º, V e IX)</td>
            </tr>
            <tr>
              <td>Clientes e fornecedores: nome, CPF/CNPJ, contato, endereço</td>
              <td>Contas a pagar e a receber, notas fiscais</td>
              <td>Execução de contrato e obrigação legal (art. 7º, II e V)</td>
            </tr>
            <tr>
              <td>Notas fiscais e títulos</td>
              <td>Gestão financeira e guarda fiscal</td>
              <td>Obrigação legal (art. 7º, II; guarda em regra por 5 anos)</td>
            </tr>
            <tr>
              <td>Registro de atividades e de segurança</td>
              <td>Auditoria (quem fez o quê) e proteção contra acesso indevido</td>
              <td>Legítimo interesse e segurança (art. 7º, IX; art. 46)</td>
            </tr>
          </tbody>
        </table>

        <h2>Onde os dados ficam</h2>
        <ul>
          <li>No armazenamento local do navegador (localStorage), no aparelho onde o Prumo é usado. Outro aparelho não enxerga esses dados.</li>
          <li>
            Ao buscar um CNPJ ou CEP, só esse número é enviado à BrasilAPI (serviço público e gratuito) para trazer os dados da Receita/Correios. Nenhum outro
            dado sai do aparelho.
          </li>
          <li>As fontes e o código são servidos pelo próprio site: nenhum serviço de terceiros acompanha o que você faz.</li>
        </ul>

        <h2>Seus direitos (art. 18 da LGPD) e onde exercê-los</h2>
        <ul>
          <li>
            <strong>Acessar e levar seus dados</strong> (portabilidade): Configurações → Privacidade → <em>Baixar meus dados</em>.
          </li>
          <li>
            <strong>Corrigir</strong>: Configurações → Meu perfil.
          </li>
          <li>
            <strong>Excluir sua conta</strong>: Configurações → Privacidade → <em>Excluir minha conta</em>. Seus dados pessoais são apagados; os lançamentos
            que você fez continuam no histórico da empresa como “Usuário removido”, porque a guarda dos registros financeiros é obrigatória.
          </li>
          <li>
            <strong>Cliente ou fornecedor pessoa física</strong> que pedir exclusão: a empresa usa <em>Anonimizar dados pessoais</em> na ficha do contato. Nome,
            CPF e contatos somem; os valores e as notas ficam pelo prazo legal.
          </li>
        </ul>

        <h2>Segurança</h2>
        <ul>
          <li>Senhas guardadas apenas como hash com sal e 20.000 iterações; nunca em texto.</li>
          <li>Bloqueio temporário após 5 tentativas de senha erradas; sessão encerrada após 30 minutos parado (ou 30 dias com “manter conectado”).</li>
          <li>Senha provisória (criada por um administrador) precisa ser trocada no primeiro acesso.</li>
          <li>Níveis de acesso: Administrador, Financeiro e Consulta. Todas as ações ficam registradas.</li>
          <li>Proteções do site: política de segurança de conteúdo (CSP), bloqueio contra abertura dentro de outros sites e planilhas exportadas protegidas contra fórmulas maliciosas.</li>
        </ul>

        <h2>Termos de uso desta versão</h2>
        <ul>
          <li>Esta é uma versão de demonstração e avaliação. Faça backup (Configurações → Dados) com frequência: limpar os dados do navegador apaga tudo.</li>
          <li>Não use um computador compartilhado sem sair do sistema ao final. Para apagar tudo deste aparelho: Configurações → Privacidade.</li>
          <li>O DRE é gerencial e não substitui a contabilidade oficial.</li>
          <li>O código é de propriedade de Reginaldo Jeronimo; todos os direitos reservados.</li>
        </ul>

        <h2>Incidentes</h2>
        <p>
          Se você suspeitar de acesso indevido, troque sua senha e avise o administrador. Na versão com servidor, incidentes com risco aos titulares serão
          comunicados à ANPD e às pessoas afetadas, como manda a lei (art. 48).
        </p>
      </article>
    </div>
  );
}
