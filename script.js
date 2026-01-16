document.addEventListener('DOMContentLoaded', () => {

    // --- CONFIGURAÇÃO (IGUAL LP DUBAI) ---
    const WEBHOOK_URL_1 = 'https://n8nwebhook.arck1pro.shop/webhook/lp-lead-direto';
    const WEBHOOK_URL_2 = 'https://n8nwebhook.arck1pro.shop/webhook/lp-lead-direto-rdmkt';

    // --- 1. INICIALIZAÇÃO DO TELEFONE ---
    const phoneInput = document.getElementById('telefone');
    let iti;

    if (phoneInput && window.intlTelInput) {
        iti = window.intlTelInput(phoneInput, {
            // CORREÇÃO CRÍTICA: Aponta para o arquivo JS
            utilsScript: "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/17.0.8/js/utils.js",
            initialCountry: "auto",
            geoIpLookup: function(callback) {
                fetch("https://ipapi.co/json")
                    .then(res => res.json())
                    .then(data => callback(data.country_code))
                    .catch(() => callback("br"));
            },
            preferredCountries: ['br', 'pt', 'us'],
            separateDialCode: true // Opcional: Mostra o DDI separado (+55) visualmente
        });
    } else {
        console.warn("Input #telefone não encontrado ou biblioteca não carregou.");
    }

    // --- 2. LÓGICA DO FORMULÁRIO ---
    const contactForm = document.getElementById('contact-form');
    
    // Função UTMs
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

    if (contactForm) {
        contactForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            
            const submitButton = contactForm.querySelector('button[type="submit"]');
            const formStatus = document.getElementById('form-status');
            
            // Limpa mensagens anteriores
            if (formStatus) {
                formStatus.textContent = '';
                formStatus.className = '';
            }

            // Validação do Telefone
            if (iti && !iti.isValidNumber()) {
                const msg = 'Por favor, insira um número de telefone válido.';
                if (formStatus) {
                    formStatus.textContent = msg;
                    formStatus.className = 'form-status-error'; // Classe definida no CSS novo
                } else {
                    alert(msg);
                }
                return;
            }

            // Trava botão
            submitButton.disabled = true;
            submitButton.textContent = 'ENVIANDO...';

            // Prepara dados
            const urlParams = new URLSearchParams(window.location.search);
            const rawFormData = new FormData(contactForm);
            
            const payload = {
                nome: rawFormData.get('nome'),
                email: rawFormData.get('email'),
                profissao: rawFormData.get('profissao'),
                whatsapp: iti ? iti.getNumber() : rawFormData.get('whatsapp'), // Pega número completo (+55...)
                investe_atualmente: rawFormData.get('investe_atualmente'),
                prazo_investimento: rawFormData.get('prazo_investimento'),
                ciente_emprestimos: rawFormData.get('ciente_emprestimos'),
                valor_investimento: rawFormData.get('valor_investimento'),
                
                utm_placement: urlParams.get('utm_placement') || '',
                utm_id: urlParams.get('utm_id') || '',
                ...getUtmParams()
            };

            try {
                // Envio 1 (Principal)
                const response1 = await fetch(WEBHOOK_URL_1, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                // Tratamento de Duplicidade (409)
                if (response1.status === 409) {
                    const msg = 'Você já tem um cadastro conosco.';
                    if (formStatus) {
                        formStatus.textContent = msg;
                        formStatus.className = 'form-status-error';
                    } else {
                        alert(msg);
                    }
                    submitButton.disabled = false;
                    submitButton.textContent = 'QUERO ME REGISTRAR';
                    return;
                }

                if (!response1.ok) throw new Error(`Erro API: ${response1.status}`);

                // Envio 2 (RD Station / Backup)
                try {
                    await fetch(WEBHOOK_URL_2, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                } catch (e) { console.warn('Erro secundário ignorado'); }

                // Sucesso
                if (formStatus) {
                    formStatus.textContent = 'Sucesso! Redirecionando...';
                    formStatus.className = 'form-status-success';
                }
                
                if (typeof fbq === 'function') fbq('track', 'CompleteRegistration');

                setTimeout(() => {
                    window.location.href = 'obrigado.html';
                }, 1000);

            } catch (error) {
                console.error(error);
                const msg = 'Erro ao enviar. Tente novamente.';
                if (formStatus) {
                    formStatus.textContent = msg;
                    formStatus.className = 'form-status-error';
                } else {
                    alert(msg);
                }
                submitButton.disabled = false;
                submitButton.textContent = 'QUERO ME REGISTRAR';
            }
        });
    }
});

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
