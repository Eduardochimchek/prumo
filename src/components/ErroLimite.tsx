// Se algo quebrar numa tela, mostra uma mensagem amigável em vez de página em branco
// (e sem expor detalhes técnicos, pilha de chamadas ou dados, ao usuário).

import { Component, type ReactNode } from 'react';

export class ErroLimite extends Component<{ children: ReactNode }, { erro: boolean }> {
  state = { erro: false };

  static getDerivedStateFromError() {
    return { erro: true };
  }

  componentDidCatch(erro: unknown) {
    // Só no console do desenvolvedor. Na V2: enviar a um serviço de monitoramento, sem dados pessoais.
    console.error('Prumo: erro na tela', erro);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="vazio" role="alert" style={{ minHeight: '60vh', justifyContent: 'center' }}>
        <h3>Algo saiu do prumo nesta tela</h3>
        <p>Seus dados estão salvos. Recarregue a página; se continuar, volte para o início.</p>
        <div className="linha-acoes" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn--primario" onClick={() => location.reload()}>
            Recarregar
          </button>
          <a className="btn btn--secundario" href="#/" onClick={() => this.setState({ erro: false })}>
            Ir para o início
          </a>
        </div>
      </div>
    );
  }
}
