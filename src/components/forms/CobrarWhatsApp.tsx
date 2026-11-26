// Cobrar pelo WhatsApp: mensagem pronta (lembrete, vence hoje ou atraso), com o PIX/boleto junto,
// que a pessoa revisa e envia pelo WhatsApp do próprio aparelho. O Prumo só registra que cobrou.

import { useState } from 'react';
import { dataBR, diffDias, hoje, tempoRelativo } from '../../lib/dates';
import { moeda, plural } from '../../lib/format';
import { mascaraTelefone } from '../../lib/br';
import { linkWhatsApp, mensagemCobranca, nomeParaSaudacao, telefoneWhatsApp } from '../../lib/cobranca';
import { copiarTexto } from '../../lib/util';
import { useDb } from '../../data/store';
import { registrarCobrancaEnviada, salvarContato } from '../../data/actions';
import { indices } from '../../data/selectors';
import { useAuth, useUsuario } from '../../auth/auth';
import { Camada } from '../Camada';
import { Icone } from '../Icone';
import { AreaTexto, Botao, Caixa, Campo, Entrada } from '../ui';
import { useAvisos } from '../Avisos';

export function CobrarWhatsApp({ lancamentoId, aoFechar }: { lancamentoId: string | null; aoFechar: () => void }) {
  const db = useDb();
  const usuario = useUsuario();
  const { pode } = useAuth();
  const { avisar, erro } = useAvisos();
  const l = lancamentoId ? db.lancamentos.find((x) => x.id === lancamentoId) : undefined;
  const contato = l?.contatoId ? db.contatos.find((c) => c.id === l.contatoId) : undefined;
  const [texto, setTexto] = useState<string | null>(null);
  const [telefone, setTelefone] = useState('');
  const [salvarTelefone, setSalvarTelefone] = useState(true);

  if (!l) return <Camada aberta={false} aoFechar={aoFechar}>{null}</Camada>;

  const ref = hoje();
  const cobranca = l.cobranca && !l.cobranca.pagaEm ? l.cobranca : undefined;
  const padrao = mensagemCobranca({
    empresa: db.empresa.nomeFantasia || db.empresa.razaoSocial,
    cliente: contato && !contato.anonimizadoEm ? nomeParaSaudacao(contato.nome, contato.fantasia, contato.documento) : undefined,
    valor: l.valor,
    vencimento: l.vencimento,
    ref,
    referente: l.documento || l.descricao,
    pix: cobranca?.pixCopiaECola,
    linhaDigitavel: cobranca ? undefined : l.linhaDigitavel,
  });
  const mensagem = texto ?? padrao;
  const telCadastro = telefoneWhatsApp(contato?.telefone);
  const telDigitado = telefoneWhatsApp(telefone);
  const tel = telCadastro ?? telDigitado;
  // Na demonstração os telefones são inventados e podem ser de alguém de verdade: o WhatsApp abre sem número.
  const link = linkWhatsApp(mensagem, db.demo ? null : tel);
  const atraso = l.vencimento < ref ? diffDias(ref, l.vencimento) : 0;
  const ultima = l.cobrancasEnviadas?.at(-1);
  const nomeUsuario = (id: string) => indices(db).usuarios.get(id)?.nome.split(' ')[0] ?? 'alguém';

  const abrir = () => {
    try {
      if (!telCadastro && telDigitado && salvarTelefone && contato && pode('contatos')) {
        salvarContato({ ...contato, telefone: mascaraTelefone(telefone) }, usuario.id);
      }
      registrarCobrancaEnviada(l.id, usuario.id);
      avisar('Cobrança registrada. Confira a mensagem no WhatsApp e toque em enviar.');
      // fecha depois do clique: o link precisa terminar de abrir o WhatsApp antes de o diálogo sumir
      window.setTimeout(aoFechar, 0);
    } catch (e) {
      erro(e);
    }
  };

  return (
    <Camada
      aberta
      aoFechar={aoFechar}
      sobretitulo="Cobrar pelo WhatsApp"
      titulo={contato ? contato.fantasia || contato.nome : l.descricao}
      rodape={
        <>
          <Botao
            icone="copiar"
            onClick={async () => {
              const ok = await copiarTexto(mensagem);
              avisar(ok ? 'Mensagem copiada.' : 'Não foi possível copiar.');
            }}
          >
            Copiar mensagem
          </Botao>
          <span className="espaco" />
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <a className="btn btn--primario" href={link} target="_blank" rel="noopener noreferrer" onClick={abrir}>
            <Icone nome="conversa" tam={18} />
            Abrir no WhatsApp
          </a>
        </>
      }
    >
      <div className="cobrar__resumo">
        <div>
          <span className="rotulo">{l.descricao}</span>
          <strong className="cobrar__valor">{moeda(l.valor)}</strong>
        </div>
        <span className={atraso ? 'critico-txt' : undefined}>
          {atraso ? `venceu em ${dataBR(l.vencimento)} · ${plural(atraso, 'dia', 'dias')} de atraso` : l.vencimento === ref ? 'vence hoje' : `vence em ${dataBR(l.vencimento)}`}
        </span>
      </div>
      {ultima && (
        <p className="muted cobrar__ultima">
          Última cobrança: {tempoRelativo(ultima.em)}, por {nomeUsuario(ultima.usuarioId)}.
        </p>
      )}

      {db.demo ? (
        <p className="aviso-caixa" style={{ marginTop: 14 }}>
          <Icone nome="info" />
          <span>
            <span className="selo-simulacao">demonstração</span> Os telefones da demonstração são inventados, então o WhatsApp vai abrir sem número: você escolhe para quem mandar
            (pode ser você mesmo, para ver como fica).
          </span>
        </p>
      ) : telCadastro ? (
        <p className="cobrar__para">
          <Icone nome="telefone" tam={16} /> Para {mascaraTelefone(contato?.telefone ?? '')}
        </p>
      ) : (
        <div className="grade-form" style={{ marginTop: 14 }}>
          <Campo
            rotulo="WhatsApp do cliente"
            htmlFor="w-tel"
            dica={telefone && !telDigitado ? 'Número incompleto: DDD + número.' : 'Este cliente não tem telefone no cadastro. Sem número, o WhatsApp pede para escolher o contato.'}
          >
            <Entrada id="w-tel" inputMode="tel" placeholder="(51) 99999-9999" value={telefone} onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} />
          </Campo>
          {contato && pode('contatos') && telDigitado && (
            <div>
              <Caixa rotulo="Salvar este número no cadastro do cliente" checked={salvarTelefone} onChange={(e) => setSalvarTelefone(e.target.checked)} />
            </div>
          )}
        </div>
      )}

      <Campo rotulo="Mensagem" htmlFor="w-msg" className="cobrar__msg" dica={texto !== null ? undefined : 'Pode editar à vontade antes de abrir o WhatsApp.'}>
        <AreaTexto id="w-msg" rows={11} value={mensagem} onChange={(e) => setTexto(e.target.value)} />
      </Campo>
      {texto !== null && texto !== padrao && (
        <button type="button" className="link" onClick={() => setTexto(null)} style={{ fontSize: 13 }}>
          Voltar para a mensagem sugerida
        </button>
      )}
      {!cobranca && !l.linhaDigitavel && (
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          Dica: gere o boleto/PIX desta conta antes; assim a mensagem já leva o código para o cliente pagar na hora.
        </p>
      )}
    </Camada>
  );
}
