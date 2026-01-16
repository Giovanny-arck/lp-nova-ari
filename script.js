document.addEventListener('DOMContentLoaded', () => {

    /* ==========================================================================
       PARTE 1: CONFIGURAÇÃO DO FORMULÁRIO E TELEFONE (PADRÃO DUBAI)
       ========================================================================== */

    const WEBHOOK_URL_1 = 'https://n8nwebhook.arck1pro.shop/webhook/lp-lead-direto';
    const WEBHOOK_URL_2 = 'https://n8nwebhook.arck1pro.shop/webhook/lp-lead-direto-rdmkt';

    // --- Inicialização do Telefone ---
    const phoneInput = document.getElementById('telefone');
    let iti;

    if (phoneInput && window.intlTelInput) {
        iti = window.intlTelInput(phoneInput, {
            utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js",
            initialCountry: "auto",
            geoIpLookup: function(callback) {
                fetch("https://ipapi.co/json")
                    .then(res => res.json())
                    .then(data => callback(data.country_code))
                    .catch(() => callback("br"));
            },
            preferredCountries: ['br', 'pt', 'us'],
            separateDialCode: true
        });
    }

    // --- Lógica de Envio do Formulário ---
    const contactForm = document.getElementById('contact-form');
    
    function getUtmParams() {
        const params = new URLSearchParams(window.location.search);
        const utm = {};
        for (const [key, value] of params.entries()) {
            if (key.startsWith('utm_')) utm[key] = value;
        }
        return utm;
    }

    if (contactForm) {
        contactForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const submitButton = contactForm.querySelector('button[type="submit"]');
            const formStatus = document.getElementById('form-status');
            
            if (formStatus) { formStatus.textContent = ''; formStatus.className = ''; }

            // Validação Telefone
            if (iti && !iti.isValidNumber()) {
                const msg = 'Por favor, insira um número de telefone válido.';
                if (formStatus) { formStatus.textContent = msg; formStatus.className = 'form-status-error'; }
                else { alert(msg); }
                return;
            }

            submitButton.disabled = true;
            submitButton.textContent = 'ENVIANDO...';

            const urlParams = new URLSearchParams(window.location.search);
            const rawFormData = new FormData(contactForm);
            
            const payload = {
                nome: rawFormData.get('nome'),
                email: rawFormData.get('email'),
                profissao: rawFormData.get('profissao'),
                whatsapp: iti ? iti.getNumber() : rawFormData.get('whatsapp'),
                investe_atualmente: rawFormData.get('investe_atualmente'),
                prazo_investimento: rawFormData.get('prazo_investimento'),
                ciente_emprestimos: rawFormData.get('ciente_emprestimos'),
                valor_investimento: rawFormData.get('valor_investimento'),
                utm_placement: urlParams.get('utm_placement') || '',
                utm_id: urlParams.get('utm_id') || '',
                ...getUtmParams()
            };

            try {
                // Webhook 1
                const response1 = await fetch(WEBHOOK_URL_1, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response1.status === 409) {
                    const msg = 'Você já tem um cadastro conosco.';
                    if (formStatus) { formStatus.textContent = msg; formStatus.className = 'form-status-error'; }
                    else { alert(msg); }
                    submitButton.disabled = false;
                    submitButton.textContent = 'QUERO ME REGISTRAR';
                    return;
                }

                if (!response1.ok) throw new Error(`Erro API: ${response1.status}`);

                // Webhook 2
                try {
                    await fetch(WEBHOOK_URL_2, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                } catch (e) { console.warn('Erro secundário ignorado'); }

                // Sucesso
                if (formStatus) { formStatus.textContent = 'Sucesso! Redirecionando...'; formStatus.className = 'form-status-success'; }
                if (typeof fbq === 'function') fbq('track', 'CompleteRegistration');

                setTimeout(() => { window.location.href = 'obrigado.html'; }, 1000);

            } catch (error) {
                console.error(error);
                const msg = 'Erro ao enviar. Tente novamente.';
                if (formStatus) { formStatus.textContent = msg; formStatus.className = 'form-status-error'; }
                else { alert(msg); }
                submitButton.disabled = false;
                submitButton.textContent = 'QUERO ME REGISTRAR';
            }
        });
    }


    /* ==========================================================================
       PARTE 2: LÓGICA DA CALCULADORA (RESTAURADA DO ORIGINAL)
       ========================================================================== */
    
    const valorInput = document.getElementById('valor-aplicado');
    const tempoBtns = document.querySelectorAll('.tempo-btn');
    const formaBtns = document.querySelectorAll('.forma-btn');
    const valorError = document.getElementById('valor-error');

    // Elementos de resultado
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
        if (!valorInput) return; // Segurança caso o elemento não exista
        const valorStr = valorInput.value.replace(/\./g, '').replace(',', '.');
        const valor = parseFloat(valorStr) || 0;

        // Validação Mínima
        if (valor > 0 && valor < valorMinimo) {
            if (valorError) valorError.style.display = 'block';
            resetarResultados();
            updateResultVisibility();
            return;
        } else {
            if (valorError) valorError.style.display = 'none';
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

        if (mensalResultValue) mensalResultValue.textContent = formatarMoeda(resultadoMensal);
        if (jurosTotalResultValue) jurosTotalResultValue.textContent = formatarMoeda(resultadoTotalMensalPeriodo);
        if (totalFinalResultValue) totalFinalResultValue.textContent = formatarMoeda(resultadoTotalFinal);

        updateResultVisibility();
    }

    function updateResultVisibility() {
        if (formaSelecionada === 'mensal') {
            if (mensalResultBlock) mensalResultBlock.style.display = 'block';
            if (jurosTotalResultBlock) jurosTotalResultBlock.style.display = 'block';
            if (jurosTotalResultLabel) jurosTotalResultLabel.textContent = 'Valor Total no Período:';
            if (totalFinalResultBlock) totalFinalResultBlock.style.display = 'none';
            if (noteFinal) noteFinal.style.display = 'none';
            if (noteMensal) noteMensal.style.display = 'block';
        } else {
            if (mensalResultBlock) mensalResultBlock.style.display = 'none';
            if (jurosTotalResultBlock) jurosTotalResultBlock.style.display = 'none';
            if (totalFinalResultBlock) totalFinalResultBlock.style.display = 'block';
            if (noteFinal) noteFinal.style.display = 'block';
            if (noteMensal) noteMensal.style.display = 'none';
        }
    }

    function resetarResultados() {
        if (mensalResultValue) mensalResultValue.textContent = 'R$ 0,00';
        if (jurosTotalResultValue) jurosTotalResultValue.textContent = 'R$ 0,00';
        if (totalFinalResultValue) totalFinalResultValue.textContent = 'R$ 0,00';
    }

    // Event Listeners da Calculadora
    if (valorInput) {
        valorInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            // Formatação visual (Máscara 50.000)
            e.target.value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
            calcularSimulacao();
        });
    }

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

    // Lógica do Acordeão (FAQ) - Restaurada também
    const accordions = document.querySelectorAll('.accordion');
    accordions.forEach(accordion => {
        const items = accordion.querySelectorAll('.accordion-item');
        items.forEach(item => {
            const header = item.querySelector('.accordion-header');
            if(header){
                header.addEventListener('click', () => {
                    const isActive = item.classList.contains('active');
                    const parentAccordion = header.closest('.accordion');
                    parentAccordion.querySelectorAll('.accordion-item').forEach(otherItem => {
                        if (otherItem !== item || isActive) {
                        otherItem.classList.remove('active');
                        const otherHeader = otherItem.querySelector('.accordion-header');
                        if(otherHeader) otherHeader.setAttribute('aria-expanded', 'false');
                        }
                    });
                    if (!isActive) {
                        item.classList.add('active');
                        header.setAttribute('aria-expanded', 'true');
                    }
                });
            }
        });
    });

    // Inicializa
    updateResultVisibility();
});
