document.addEventListener('DOMContentLoaded', () => {

    // --- URLs DOS WEBHOOKS ---
    const WEBHOOK_URL_1 = 'https://n8nwebhook.arck1pro.shop/webhook/lp-lead-direto';
    const WEBHOOK_URL_2 = 'https://n8nwebhook.arck1pro.shop/webhook/lp-lead-direto-rdmkt';

    // --- INICIALIZAÇÃO DO CAMPO DE TELEFONE INTERNACIONAL ---
    const phoneInput = document.getElementById('telefone');
    let iti;

    if (phoneInput) {
        iti = window.intlTelInput(phoneInput, {
            utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/19.2.16/js/utils.js",
            initialCountry: "auto",
            geoIpLookup: function(success, failure) {
                fetch("https://ipapi.co/json")
                    .then(res => res.json())
                    .then(data => success(data.country_code))
                    .catch(() => success("br"));
            },
            preferredCountries: ['br', 'pt', 'us']
        });
    }

    // --- FORMULÁRIO DA HERO SECTION ---
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

    // --- FUNÇÃO DE SUBMISSÃO CORRIGIDA E ROBUSTA ---
    async function handleFormSubmit(event) {
        event.preventDefault();
        const formStatus = document.getElementById('form-status');
        const submitButton = contactForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'ENVIANDO...';
        formStatus.textContent = '';
        formStatus.className = '';

        // Validação do telefone
        if (iti && !iti.isValidNumber()) {
            formStatus.textContent = 'Por favor, insira um número de telefone válido.';
            formStatus.className = 'error';
            submitButton.disabled = false;
            submitButton.textContent = 'QUERO ME REGISTRAR';
            return;
        }

        const formData = new FormData(contactForm);
        const data = Object.fromEntries(formData.entries());
        const formattedPhone = iti ? iti.getNumber() : data.whatsapp;

        // Monta o payload com as UTMs na raiz do objeto
        const payload = {
            ...data,
            whatsapp: formattedPhone,
            ...getUtmParams(),
            submittedAt: new Date().toISOString()
        };

        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        };

        try {
            // 1. Envio Principal (N8N) - Crítico
            const response1 = await fetch(WEBHOOK_URL_1, requestOptions);

            if (response1.status === 409) {
                formStatus.textContent = 'Você já tem um cadastro conosco.';
                formStatus.className = 'error';
                submitButton.disabled = false;
                submitButton.textContent = 'QUERO ME REGISTRAR';
                return;
            }

            if (!response1.ok) {
                throw new Error(`Erro no Webhook Principal: ${response1.status}`);
            }

            // 2. Envio Secundário (RD Mkt) - Isolado para não quebrar o fluxo
            try {
                await fetch(WEBHOOK_URL_2, requestOptions);
            } catch (errorWebhook2) {
                console.warn("Aviso: Segundo webhook não completou, mas seguindo fluxo de sucesso.", errorWebhook2);
            }

            // 3. Sucesso e Redirecionamento
            formStatus.textContent = 'Cadastro realizado com sucesso! Redirecionando...';
            formStatus.className = 'success';

            // Disparo do Pixel
            if (typeof fbq === 'function') {
                // CORREÇÃO: Acessa payload.utm_source diretamente
                fbq('track', 'Lead', {
                    content_name: 'Cadastro LP ARI',
                    name: data.nome || '',
                    email: data.email || '',
                    phone: formattedPhone || '',
                    utm_source: payload.utm_source || ''
                });
                
                const eventId = 'evt_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
                fbq('track', 'CompleteRegistration', {}, { eventID: eventId });
            }

            setTimeout(() => {
                window.location.href = 'obrigado.html';
            }, 1000);

        } catch (error) {
            console.error('ERRO FATAL:', error);
            formStatus.textContent = 'Erro ao processar cadastro. Tente novamente.';
            formStatus.className = 'error';
            submitButton.disabled = false;
            submitButton.textContent = 'QUERO ME REGISTRAR';
        }
    }

    // --- LÓGICA DA CALCULADORA ---
    const valorInput = document.getElementById('valor-aplicado');
    const tempoBtns = document.querySelectorAll('.tempo-btn');
    const formaBtns = document.querySelectorAll('.forma-btn');
    const valorError = document.getElementById('valor-error');

    const mensalResultBlock = document.getElementById('result-block-mensal');
    const mensalResultValue = document.getElementById('result-value-mensal');
    const jurosTotalResultBlock = document.getElementById('result-block-juros-total');
    const jurosTotalResultLabel = document.getElementById('result-label-juros-total');
    const jurosTotalResultValue = document.getElementById('result-value-juros-total');
    const totalFinalResultBlock = document.getElementById('result-block-total-final');
    const totalFinalResultValue = document.getElementById('result-value-total-final');
    const noteFinal = document.getElementById('results-note-final');
    const noteMensal = document.getElementById('results-note-mensal');

    let mesesSelecionados = 0;
    let formaSelecionada = 'final';

    const taxaPrazo = {
        18: { mensal: 0.015, final: 0.015 },
        24: { mensal: 0.016, final: 0.016 },
        36: { mensal: 0.018, final: 0.018 }
    };
    const taxaExtra = [
        { min: 50000, max: 99999.99, extra: 0.000 },
        { min: 100000, max: 199999.99, extra: 0.003 },
        { min: 200000, max: 399999.99, extra: 0.005 },
        { min: 400000, max: Infinity, extra: 0.007 }
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

        if (valor > 0 && valor < valorMinimo) {
            valorError.style.display = 'block';
            resetarResultados();
            updateResultVisibility();
            return;
        } else {
            valorError.style.display = 'none';
        }

        if (valor < valorMinimo || mesesSelecionados === 0) {
            resetarResultados();
            updateResultVisibility();
            return;
        }

        const taxaExtraValor = obterTaxaExtraPorValor(valor);

        // Mensal
        const taxaBaseMensal = taxaPrazo[mesesSelecionados].mensal;
        const taxaTotalMensal = taxaBaseMensal + taxaExtraValor;
        const resultadoMensal = valor * taxaTotalMensal;
        const totalJurosMensalPeriodo = resultadoMensal * mesesSelecionados;
        const resultadoTotalMensalPeriodo = valor + totalJurosMensalPeriodo;

        // Final
        const taxaBaseFinal = taxaPrazo[mesesSelecionados].final;
        const taxaTotalFinal = taxaBaseFinal + taxaAdicionalFinal + taxaExtraValor;
        const resultadoFinalJuros = (valor * taxaTotalFinal) * mesesSelecionados;
        const resultadoTotalFinal = valor + resultadoFinalJuros;

        mensalResultValue.textContent = formatarMoeda(resultadoMensal);
        jurosTotalResultValue.textContent = formatarMoeda(resultadoTotalMensalPeriodo);
        totalFinalResultValue.textContent = formatarMoeda(resultadoTotalFinal);

        updateResultVisibility();
    }

    function updateResultVisibility() {
        if (formaSelecionada === 'mensal') {
            mensalResultBlock.style.display = 'block';
            jurosTotalResultBlock.style.display = 'block';
            jurosTotalResultLabel.textContent = 'Valor Total no Período:';
            totalFinalResultBlock.style.display = 'none';
            if (noteFinal) noteFinal.style.display = 'none';
            if (noteMensal) noteMensal.style.display = 'block';
        } else {
            mensalResultBlock.style.display = 'none';
            jurosTotalResultBlock.style.display = 'none';
            totalFinalResultBlock.style.display = 'block';
            if (noteFinal) noteFinal.style.display = 'block';
            if (noteMensal) noteMensal.style.display = 'none';
        }
    }

    function resetarResultados() {
        mensalResultValue.textContent = 'R$ 0,00';
        jurosTotalResultValue.textContent = 'R$ 0,00';
        totalFinalResultValue.textContent = 'R$ 0,00';
    }

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
            calcularSimulacao();
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

    // --- LÓGICA DO ACORDEÃO (FAQ) ---
    const accordions = document.querySelectorAll('.accordion');
    accordions.forEach(accordion => {
        const items = accordion.querySelectorAll('.accordion-item');
        items.forEach(item => {
            const header = item.querySelector('.accordion-header');
            header.addEventListener('click', () => {
                const isActive = item.classList.contains('active');
                const parentAccordion = header.closest('.accordion');
                parentAccordion.querySelectorAll('.accordion-item').forEach(otherItem => {
                    if (otherItem !== item || isActive) {
                       otherItem.classList.remove('active');
                       otherItem.querySelector('.accordion-header').setAttribute('aria-expanded', 'false');
                    }
                });
                if (!isActive) {
                    item.classList.add('active');
                    header.setAttribute('aria-expanded', 'true');
                }
            });
        });
    });

    updateResultVisibility();
});
