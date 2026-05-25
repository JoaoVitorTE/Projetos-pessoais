const projectGrid = document.getElementById('projectGrid'); // onde os cards de projeto v�o aparecer
const filterButtons = document.querySelectorAll('.portfolio-filters button'); // bot�es que filtram os projetos
const typewriterElement = document.getElementById('typewriter'); // elemento que mostra o texto digitando

const projects = [ // lista de projetos simples
  { title: 'Portfolio Inteligente', description: 'Site de apresentação com filtros simples e visual limpo.', tech: 'HTML CSS JavaScript', type: 'web' }, // projeto 1
  { title: 'Landing Responsiva', description: 'Página preparada para venda, com design claro e objetivo.', tech: 'HTML CSS JS', type: 'web' }, // projeto 2
  { title: 'Painel Administrativo', description: 'Dashboard com informações de cliente e projeto de fácil leitura.', tech: 'JavaScript APIs UX', type: 'web' }, // projeto 3
  { title: 'Campanha Social', description: 'Projeto com foco em impacto social e boa mensagem visual.', tech: 'HTML CSS Conteúdo', type: 'social' } // projeto 4
];

let phraseIndex = 0; // índice da frase atual do typewriter
let letterIndex = 0; // índice da letra atual na frase
let typing = true; // se estamos digitando ou apagando

function showProjects(filter) { // mostra os projetos na página
  let html = ''; // guarda o HTML que vai ser escrito
  for (let i = 0; i < projects.length; i = i + 1) { // percorre todos os projetos
    const project = projects[i]; // projeto atual
    if (filter === 'all' || project.type === filter) { // verifica se o projeto deve aparecer
      html = html + // concatena o novo card ao HTML
        '<article class="project-card">' +
        '<h4>' + project.title + '</h4>' +
        '<p>' + project.description + '</p>' +
        '<span><i class="fa-solid fa-code"></i>' + project.tech + '</span>' +
        '</article>';
    }
  }
  projectGrid.innerHTML = html; // mostra todos os cards na tela
}

function setFilterButtons() { // configura clique nos botões de filtro
  for (let i = 0; i < filterButtons.length; i = i + 1) { // percorre os botões
    const button = filterButtons[i]; // botão atual
    button.addEventListener('click', function () { // quando clicar no botão
      for (let j = 0; j < filterButtons.length; j = j + 1) { // tira o active de todos
        filterButtons[j].classList.remove('active');
      }
      button.classList.add('active'); // marca o botão atual
      const filter = button.getAttribute('data-filter'); // lê qual filtro usar
      showProjects(filter); // atualiza a lista de projetos
    });
  }
}

function typeWriter() { // efeito de digitar e apagar o texto
  const phrases = [ // frases que vão aparecer
    'Desenvolvedor web e criador de experiências digitais.',
    'Transformo ideias em portfólios elegantes e funcionais.',
    'Aqui você encontra tecnologia com personalidade profissional.'
  ];
  const text = phrases[phraseIndex]; // frase atual
  let result = ''; // texto que vai aparecer

  if (typing) { // se está digitando
    letterIndex = letterIndex + 1; // avança uma letra
    result = text.substring(0, letterIndex); // pega parte do texto
    typewriterElement.textContent = result; // mostra na página
    if (letterIndex === text.length) { // se terminou a frase
      typing = false; // agora vai apagar
      setTimeout(typeWriter, 1200); // espera antes de apagar
      return; // sai da função para não continuar agora
    }
  } else { // se está apagando
    letterIndex = letterIndex - 1; // volta uma letra
    result = text.substring(0, letterIndex); // pega parte menor do texto
    typewriterElement.textContent = result; // atualiza na página
    if (letterIndex === 0) { // se apagou tudo
      typing = true; // agora vai digitar de novo
      phraseIndex = phraseIndex + 1; // passa para a próxima frase
      if (phraseIndex === phrases.length) { // se chegou no final da lista
        phraseIndex = 0; // volta para a primeira frase
      }
    }
  }

  setTimeout(typeWriter, typing ? 80 : 40); // chama a função de novo depois de um tempo
}

function init() { // inicia o script quando a página carrega
  showProjects('all'); // mostra todos os projetos
  setFilterButtons(); // liga os botões de filtro
  typeWriter(); // começa o efeito typewriter
}

init(); // executa tudo quando o script começa
