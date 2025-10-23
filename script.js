document.addEventListener('DOMContentLoaded', () => {

    // --- URLs DOS WEBHOOKS (SUBSTITUA PELOS SEUS) ---
    const WEBHOOK_URL_1 = 'https://n8nwebhook.arck1pro.shop/webhook/lp-lead-direto';
    const WEBHOOK_URL_2 = 'https://n8nwebhook.arck1pro.shop/webhook/lp-lead-direto-rdmkt';

    // --- INICIALIZAÇÃO DO CAMPO DE TELEFONE INTERNACIONAL ---
    const phoneInput = document.getElementById('telefone');
    let iti; // Variável para guardar a instância da biblioteca

    if (phoneInput) {
        iti = window.intlTelInput(phoneInput, {
            utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/19.2.16/js/utils.js", // Necessário para validação e formatação
            initialCountry: "auto",
            geoIpLookup: function(success, failure) {
                fetch("https://ipapi.co/json")
                    .then(res => res.json())
                    .then(data => success(data.country_code))
                    .catch(() => success("br")); // Fallback para Brasil
            },
            preferredCountries: ['br', 'pt', 'us'] // Países preferenciais
        });
    }

    // --- FORMULÁRIO DA HERO SECTION (UTMs e Webhook) ---
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', handleFormSubmit);
    }

    function getUtmParams() {
        const params = new URLSearchParams(window.location.search);
        const utm = {};
        for (const [key, value] of params.entries()) {
            if (key.startsWith('utm_')) {
                utm[key] = value;
            }
        }
        return utm;
    }

    // --- GERA UM ID ÚNICO PARA O EVENTO ---
    function generateEventId() {
        return 'evt_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        const formStatus = document.getElementById('form-status');
        const submitButton = contactForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'ENVIANDO...';
        formStatus.textContent = '';
        formStatus.className = '';

        // --- VALIDAÇÃO DO TELEFONE INTERNACIONAL ---
        if (iti && !iti.isValidNumber()) {
            formStatus.textContent = 'Por favor, insira um número de telefone válido.';
            formStatus.className = 'error';
            submitButton.disabled = false;
            submitButton.textContent = 'QUERO ME REGISTRAR';
            return; // Para a submissão se o número for inválido
        }
        // --- FIM DA VALIDAÇÃO ---


        const formData = new FormData(contactForm);
        const data = Object.fromEntries(formData.entries());

        // --- FORMATAÇÃO DO TELEFONE ---
        // Pega o número internacional completo (ex: +554799999999)
        const formattedPhone = iti ? iti.getNumber() : data.whatsapp; 
        // --- FIM DA FORMATAÇÃO ---

        const payload = {
            ...data,
            whatsapp: formattedPhone, // Substitui o whatsapp original pelo formatado
            utms: getUtmParams(),
            submittedAt: new Date().toISOString()
        };

        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        };

        try {
            const [result1, result2] = await Promise.allSettled([
                fetch(WEBHOOK_URL_1, requestOptions),
                fetch(WEBHOOK_URL_2, requestOptions)
            ]);

            const isSuccess = (result1.status === 'fulfilled' && result1.value.ok) ||
                              (result2.status === 'fulfilled' && result2.value.ok);

            if (isSuccess) {
                formStatus.textContent = 'Dados enviados com sucesso! Redirecionando...'; // MENSAGEM ATUALIZADA
                formStatus.className = 'success';
                contactForm.reset();

                // --- DISPARO DO PIXEL DA META ---
                if (typeof fbq === 'function') {
                    // Evento Lead
                    fbq('track', 'Lead', {
                        name: data.nome || '',
                        email: data.email || '',
                        phone: formattedPhone || '', // Envia o número formatado
                        utm_source: payload.utms.utm_source || ''
                    });
                    console.log("Evento Meta Pixel 'Lead' disparado");

                    // Evento CompleteRegistration com eventID
                    const eventId = generateEventId();
                    fbq('track', 'CompleteRegistration', {}, { eventID: eventId });
                    console.log("Evento Meta Pixel 'CompleteRegistration' disparado com eventID:", eventId);
                }

                // --- REDIRECIONAMENTO PARA PÁGINA DE OBRIGADO ---
                setTimeout(() => {
                    window.location.href = 'obrigado.html';
                }, 1000); // Delay de 1 segundo para o usuário ler a mensagem e o pixel disparar

            } else {
                throw new Error('Falha no envio para ambos os webhooks.');
            }
        } catch (error) {
            console.error('Erro ao enviar formulário:', error);
            formStatus.textContent = 'Erro ao enviar. Tente novamente.';
            formStatus.className = 'error';
        } finally {
            // Não reabilita o botão se o envio foi sucesso (pois vai redirecionar)
            if (formStatus.className !== 'success') {
                submitButton.disabled = false;
                submitButton.textContent = 'QUERO ME REGISTRAR';
            }
        }
    }


    // --- LÓGICA DA CALCULADORA ATUALIZADA ---
    const valorInput = document.getElementById('valor-aplicado');
    const tempoBtns = document.querySelectorAll('.tempo-btn');
    const formaBtns = document.querySelectorAll('.forma-btn'); // Botões de modalidade
    const valorError = document.getElementById('valor-error');

    // Seletores para os blocos e valores de resultado
    const mensalResultBlock = document.getElementById('result-block-mensal');
    const mensalResultValue = document.getElementById('result-value-mensal');

    const jurosTotalResultBlock = document.getElementById('result-block-juros-total');
    const jurosTotalResultLabel = document.getElementById('result-label-juros-total'); // Label para texto dinâmico
    const jurosTotalResultValue = document.getElementById('result-value-juros-total');

    const totalFinalResultBlock = document.getElementById('result-block-total-final');
    const totalFinalResultValue = document.getElementById('result-value-total-final');

    // Seletores para as notas de observação
    const noteFinal = document.getElementById('results-note-final');
    const noteMensal = document.getElementById('results-note-mensal');


    let mesesSelecionados = 0;
    let formaSelecionada = 'final'; // Começa com "Rendimento no Final" selecionado

    const taxaPrazo = {
        18: { mensal: 0.015, final: 0.015 }, 24: { mensal: 0.016, final: 0.016 }, 36: { mensal: 0.018, final: 0.018 }
    };
    const taxaExtra = [
        { min: 50000, max: 99999.99, extra: 0.000 }, { min: 100000, max: 199999.99, extra: 0.003 },
        { min: 200000, max: 399999.99, extra: 0.005 }, { min: 400000, max: Infinity, extra: 0.007 }
    ];
    const taxaAdicionalFinal = 0.005;
    const valorMinimo = 50000;

    function formatarMoeda(valor) {
        if (isNaN(valor) || valor < 0) return 'R$ 0,00';
        return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function obterTaxaExtraPorValor(valor) {
        return taxaExtra.find(f => valor >= f.min && valor <= f.max)?.extra || 0;
    }

    function calcularSimulacao() {
        const valorStr = valorInput.value.replace(/\./g, '').replace(',', '.');
        const valor = parseFloat(valorStr) || 0;

        // Validação do valor mínimo
        if (valor > 0 && valor < valorMinimo) {
            valorError.style.display = 'block';
            resetarResultados();
            updateResultVisibility(); // Atualiza visibilidade mesmo resetando
            return;
        } else {
            valorError.style.display = 'none';
        }

        // Se valor ou prazo não válidos, reseta
        if (valor < valorMinimo || mesesSelecionados === 0) {
            resetarResultados();
            updateResultVisibility(); // Atualiza visibilidade mesmo resetando
            return;
        }

        const taxaExtraValor = obterTaxaExtraPorValor(valor);

        // --- Cálculos ---
        // Mensal
        const taxaBaseMensal = taxaPrazo[mesesSelecionados].mensal;
        const taxaTotalMensal = taxaBaseMensal + taxaExtraValor;
        const resultadoMensal = valor * taxaTotalMensal;
        const totalJurosMensalPeriodo = resultadoMensal * mesesSelecionados;
        const resultadoTotalMensalPeriodo = valor + totalJurosMensalPeriodo; // <-- NOVO CÁLCULO

        // Final
        const taxaBaseFinal = taxaPrazo[mesesSelecionados].final;
        const taxaTotalFinal = taxaBaseFinal + taxaAdicionalFinal + taxaExtraValor;
        const resultadoFinalJuros = (valor * taxaTotalFinal) * mesesSelecionados;
        const resultadoTotalFinal = valor + resultadoFinalJuros;

        // --- Atualiza os displays com os valores calculados ---
        mensalResultValue.textContent = formatarMoeda(resultadoMensal);
        jurosTotalResultValue.textContent = formatarMoeda(resultadoTotalMensalPeriodo); // <-- VALOR ATUALIZADO AQUI
        totalFinalResultValue.textContent = formatarMoeda(resultadoTotalFinal);

        // Atualiza a visibilidade e labels dos blocos baseado na formaSelecionada
        updateResultVisibility();
    }

    function updateResultVisibility() {
        if (formaSelecionada === 'mensal') {
            mensalResultBlock.style.display = 'block';
            jurosTotalResultBlock.style.display = 'block';
            jurosTotalResultLabel.textContent = 'Valor Total no Período:'; // <-- LABEL ATUALIZADO AQUI
            totalFinalResultBlock.style.display = 'none'; // Esconde o total final separado
            if (noteFinal) noteFinal.style.display = 'none';
            if (noteMensal) noteMensal.style.display = 'block';
        } else { // formaSelecionada === 'final'
            mensalResultBlock.style.display = 'none'; // Esconde mensal
            jurosTotalResultBlock.style.display = 'none'; // Esconde o bloco que agora é do total mensal
            totalFinalResultBlock.style.display = 'block'; // Mostra o total final
            if (noteFinal) noteFinal.style.display = 'block';
            if (noteMensal) noteMensal.style.display = 'none';
        }
    }

    function resetarResultados() {
        mensalResultValue.textContent = 'R$ 0,00';
        jurosTotalResultValue.textContent = 'R$ 0,00';
        totalFinalResultValue.textContent = 'R$ 0,00';
    }

    // --- EVENT LISTENERS ---
    valorInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        e.target.value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
        calcularSimulacao();
    });

    formaBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            formaBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            formaSelecionada = btn.dataset.forma;
            calcularSimulacao(); // Recalcula e atualiza a visibilidade
        });
    });

    tempoBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tempoBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            mesesSelecionados = parseInt(btn.dataset.meses);
            calcularSimulacao();
        });
    });

    // --- LÓGICA DO ACORDEÃO (FAQ e outros) ---
    const accordions = document.querySelectorAll('.accordion');
    accordions.forEach(accordion => {
        const items = accordion.querySelectorAll('.accordion-item');
        items.forEach(item => {
            const header = item.querySelector('.accordion-header');
            header.addEventListener('click', () => {
                const isActive = item.classList.contains('active');

                // Fecha todos os itens no mesmo accordion antes de abrir o clicado (se não for o mesmo)
                const parentAccordion = header.closest('.accordion');
                parentAccordion.querySelectorAll('.accordion-item').forEach(otherItem => {
                    if (otherItem !== item || isActive) { // Fecha outros ou o atual se ele já estava ativo
                       otherItem.classList.remove('active');
                       otherItem.querySelector('.accordion-header').setAttribute('aria-expanded', 'false');
                    }
                });

                // Abre o item clicado (se ele não estava ativo)
                if (!isActive) {
                    item.classList.add('active');
                    header.setAttribute('aria-expanded', 'true');
                }
            });
        });
    });

    // Inicializa a visibilidade correta ao carregar a página
    updateResultVisibility();
});
