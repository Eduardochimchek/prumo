// Conjunto de ícones próprio do Prumo (grade 24, traço 1.6, pontas arredondadas).
// Desenhados para o produto, não usamos bibliotecas de ícones genéricas.

const P: Record<string, string> = {
  hoje: 'M3.5 17h17 M7.5 17a4.5 4.5 0 0 1 9 0 M12 8.5v-2 M6.2 11.2 4.8 9.8 M17.8 11.2l1.4-1.4 M7 20.5h10',
  pagar: 'M7 17 17 7 M10 7h7v7',
  receber: 'M17 7 7 17 M7 10v7h7',
  nota: 'M6.5 3.5h11v17l-1.84-1.2-1.83 1.2-1.83-1.2-1.83 1.2-1.84-1.2-1.83 1.2z M9 8h6 M9 11.5h6 M9 15h3.5',
  fluxo: 'M3 15c3 0 3-6 6-6s3 6 6 6 3-6 6-6',
  contatos: 'M6 4.5h12a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6z M3.5 8.5h2.5 M3.5 12h2.5 M3.5 15.5h2.5 M12.5 7.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z M9 16.5c.6-1.8 2-2.7 3.5-2.7s2.9.9 3.5 2.7',
  relatorios: 'M4.5 19.5h15 M7 16.5v-5 M11 16.5V7 M15 16.5V9.5 M19 16.5v-3',
  usuarios: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3.5 19c.7-3 2.9-4.5 5.5-4.5s4.8 1.5 5.5 4.5 M15.5 5.3a3 3 0 0 1 0 5.4 M17 14.8c1.8.5 3 1.9 3.5 4.2',
  ajustes: 'M4 7h9 M17 7h3 M15 5v4 M4 12h3 M11 12h9 M9 10v4 M4 17h11 M19 17h1 M17 15v4',
  menu: 'M4 7h16 M4 12h16 M4 17h10',
  busca: 'M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z M16 16l4.5 4.5',
  mais: 'M12 5v14 M5 12h14',
  fechar: 'M6 6l12 12 M18 6 6 18',
  check: 'M5 12.5 9.5 17 19 7.5',
  baixo: 'M6 9l6 6 6-6',
  direita: 'M9 6l6 6-6 6',
  esquerda: 'M15 6l-6 6 6 6',
  cima: 'M6 15l6-6 6 6',
  enviar: 'M12 15V4.5 M8 8.5l4-4 4 4 M4.5 14.5v4a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-4',
  baixar: 'M12 4.5V15 M8 11l4 4 4-4 M4.5 14.5v4a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-4',
  copiar: 'M9 9h10.5v10.5H9z M15 9V4.5H4.5V15H9',
  externo: 'M13.5 4.5h6v6 M19.5 4.5 11 13 M17 14v5.5H4.5V7H10',
  editar: 'M14.5 5.5l4 4L9 19H5v-4z M12.5 7.5l4 4',
  lixeira: 'M4.5 7h15 M9.5 7V4.5h5V7 M6.5 7l1 12.5h9l1-12.5 M10.5 10.5v6 M13.5 10.5v6',
  filtro: 'M4 6h16 M7 12h10 M10 18h4',
  calendario: 'M4.5 6.5h15v13h-15z M4.5 10.5h15 M8.5 4v4 M15.5 4v4',
  banco: 'M3.5 9.5 12 4.5l8.5 5 M5.5 9.5v8 M10 9.5v8 M14 9.5v8 M18.5 9.5v8 M3.5 19.5h17',
  alerta: 'M12 4 21 19.5H3z M12 10v4 M12 16.8v.2',
  info: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z M12 11v5.5 M12 7.8v.2',
  sair: 'M14 4.5H5.5v15H14 M10 12h10 M16.5 8.5 20 12l-3.5 3.5',
  lua: 'M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z',
  sol: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z M12 2.5v2 M12 19.5v2 M2.5 12h2 M19.5 12h2 M5.3 5.3l1.4 1.4 M17.3 17.3l1.4 1.4 M5.3 18.7l1.4-1.4 M17.3 6.7l1.4-1.4',
  olho: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
  olhoFechado: 'M3 3l18 18 M10.6 5.6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.5 9.5 6.5s-1 1.9-2.9 3.6 M6.6 6.6C4 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.8 0 3.3-.5 4.6-1.2 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  relogio: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z M12 7.5V12l3 2',
  sincronizar: 'M19.5 12a7.5 7.5 0 0 1-13 5.1 M4.5 12a7.5 7.5 0 0 1 13-5.1 M17.5 3.5v3.6h-3.6 M6.5 20.5v-3.6h3.6',
  codigoBarras: 'M4.5 6v12 M7 6v12 M10.5 6v12 M12.5 6v12 M15.5 6v12 M17.5 6v12 M19.5 6v12',
  carimbo: 'M10 9.5V7a2 2 0 1 1 4 0v2.5 M6 12.5c0-1.7 1.3-3 3-3h6c1.7 0 3 1.3 3 3V14H6z M5 16.5h14 M4.5 19.5h15',
  usuario: 'M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M5 20c.9-3.6 3.6-5.5 7-5.5s6.1 1.9 7 5.5',
  cadeado: 'M6.5 10.5h11v9h-11z M9 10.5V8a3 3 0 0 1 6 0v2.5',
  email: 'M4 6.5h16v11H4z M4.5 7l7.5 6 7.5-6',
  telefone: 'M6.5 4h3l1.5 4-2 1.3a10 10 0 0 0 5.7 5.7l1.3-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 5 5.6 1.5 1.5 0 0 1 6.5 4z',
  local: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z M12 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  predio: 'M5.5 20.5v-16h9v16 M14.5 9.5h4v11 M3.5 20.5h17 M8 8h1.5 M10.5 8H12 M8 11.5h1.5 M10.5 11.5H12 M8 15h1.5 M10.5 15H12',
  sobe: 'M4.5 16.5l5-5 3.5 3.5 6.5-6.5 M14.5 8.5h5v5',
  desce: 'M4.5 7.5l5 5 3.5-3.5 6.5 6.5 M14.5 15.5h5v-5',
  pontos: 'M6 12h.01 M12 12h.01 M18 12h.01',
  escudo: 'M12 3.5l7 2.5v5.5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z M9 12l2 2 4-4',
  voltar: 'M19 12H5 M10.5 6.5 5 12l5.5 5.5',
  avancar: 'M5 12h14 M13.5 6.5 19 12l-5.5 5.5',
  desfazer: 'M9 5.5 4.5 10 9 14.5 M4.5 10H15a4.5 4.5 0 0 1 0 9h-3',
  dinheiro: 'M3.5 7h17v10h-17z M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z M6.5 10v4 M17.5 10v4',
  arquivo: 'M7 3.5h6.5l4 4v13H7z M13.5 3.5v4h4',
  ajuda: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17z M9.6 9.5a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.2-2.4 3.7 M12 16.8v.2',
  prumo: 'M12 2v5.5 M9.2 7.5h5.6l1.2 3.6L12 22 8 11.1z',
  grade: 'M4.5 4.5h6v6h-6z M13.5 4.5h6v6h-6z M4.5 13.5h6v6h-6z M13.5 13.5h6v6h-6z',
  raio: 'M13 3 5.5 13.5H12L11 21l7.5-10.5H12z',
  vinculo: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  imprimir: 'M7 9V3.5h10V9 M7 17H4.5V9h15v8H17 M7 14h10v6.5H7z',
};

export type NomeIcone = keyof typeof P;

export function Icone({
  nome,
  tam = 18,
  traco = 1.6,
  className,
  titulo,
}: {
  nome: NomeIcone;
  tam?: number;
  traco?: number;
  className?: string;
  titulo?: string;
}) {
  const d = P[nome] ?? P.info;
  return (
    <svg
      viewBox="0 0 24 24"
      width={tam}
      height={tam}
      fill="none"
      stroke="currentColor"
      strokeWidth={nome === 'pontos' ? 3 : traco}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={titulo ? undefined : true}
      role={titulo ? 'img' : undefined}
    >
      {titulo && <title>{titulo}</title>}
      <path d={d} />
    </svg>
  );
}
