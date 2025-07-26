// ======================
// DOM Elements
// ======================
const navLinks = document.querySelectorAll('.nav-link');
const sections = document.querySelectorAll('section');
const themeToggle = document.getElementById('themeToggle');
const simulateForm = document.getElementById('simulate-form');
const resultBox = document.getElementById('resultBox');
const plantTypeInput = document.getElementById('plantType');
const plantVarietyInput = document.getElementById('plantVariety');
const plantVarietyContainer = plantVarietyInput.parentElement;
const diseaseForm = document.getElementById('disease-form');
const plantImageInput = document.getElementById('plantImage');
const diseaseResultBox = document.getElementById('diseaseResultBox');
const plantTypeDiseaseInput = document.getElementById('plantTypeDisease');
const symptomsInput = document.getElementById('symptoms');

// ======================
// Constants
// ======================
const TEXT_API_KEY = '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';
const IMAGE_API_KEY = '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';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const SIMULATION_COOLDOWN = 10000; // 10 seconds
const DISEASE_COOLDOWN = 15000; // 15 seconds
let lastSimulationTime = 0;
let lastDiseaseAnalysisTime = 0;

// ======================
// Core Functions
// ======================

function setActiveSection(sectionId) {
    // Update navigation
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.dataset.section === sectionId) {
            link.classList.add('active');
        }
    });

    // Update sections
    sections.forEach(section => {
        section.classList.remove('active');
        if (section.id === `${sectionId}-section`) {
            section.classList.add('active');
        }
    });

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    const icon = themeToggle.querySelector('i');
    icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
}

function formatSimulationResult(rawText) {
    return rawText
        .replace(/## (.*?)\n/g, '<h4>$1</h4>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^- (.*?)(\n|$)/gm, '<li>$1</li>')
        .replace(/\n/g, '<br>')
        .replace(/! (.*?)(\n|$)/g, '<div class="warning"><i class="fas fa-exclamation-triangle"></i> $1</div>');
}

function formatDiseaseResult(rawText) {
    return rawText
        .replace(/## (.*?)\n/g, '<h4>$1</h4>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^- (.*?)(\n|$)/gm, '<li>$1</li>')
        .replace(/\n/g, '<br>')
        .replace(/! (.*?)(\n|$)/g, '<div class="warning"><i class="fas fa-exclamation-triangle"></i> $1</div>')
        .replace(/Confidence: (\d+%)/g, '<span class="disease-confidence">$1</span>')
        .replace(/Treatment Step (\d+):/g, '<div class="treatment-step"><i class="fas fa-clipboard-check"></i><div class="treatment-content"><strong>Step $1:</strong>');
}

function saveSimulation(data) {
    const history = JSON.parse(localStorage.getItem('simulationHistory') || '[]');
    history.unshift({
        timestamp: new Date().toISOString(),
        ...data
    });
    localStorage.setItem('simulationHistory', JSON.stringify(history.slice(0, 5)));
}

function validateInputs(formData) {
    if (!/^\d+-\d+$/.test(formData.temperature)) {
        return 'Please enter temperature as "min-max" (e.g., 18-24)';
    }
    if (!/^\d+%?$/.test(formData.humidity)) {
        return 'Enter humidity as number (e.g., 60 or 60%)';
    }
    if (!formData.plantType.trim()) {
        return 'Plant type is required';
    }
    return null;
}

function debounce(func, timeout = 500) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}

// ======================
// Plant Simulation API Functions
// ======================

async function fetchPlantVarieties(plantName) {
    try {
        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TEXT_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.href,
                'X-Title': 'TAPE - Technology Assisted Plant Emulator'
            },
            body: JSON.stringify({
                model: "anthropic/claude-3-sonnet",
                messages: [
                    {
                        role: "system",
                        content: `You are a botanical database API. Return ONLY a JSON array of common varieties for the requested plant. Example: ["Variety A", "Variety B"]. If the plant has no common varieties, return ["Standard"].`
                    },
                    {
                        role: "user",
                        content: `List varieties for: ${plantName}`
                    }
                ],
                temperature: 0.3
            })
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        
        if (!content) {
            return ["Standard"];
        }

        try {
            const varieties = JSON.parse(content);
            return Array.isArray(varieties) ? varieties : ["Standard"];
        } catch (e) {
            return ["Standard"];
        }
    } catch (error) {
        console.error('Variety fetch error:', error);
        return ["Standard"];
    }
}

function createVarietyDropdown(varieties) {
    // Remove existing dropdown if it exists
    const existingDropdown = plantVarietyContainer.querySelector('select');
    if (existingDropdown) existingDropdown.remove();

    // Hide the text input
    plantVarietyInput.style.display = 'none';

    // Create dropdown element
    const dropdown = document.createElement('select');
    dropdown.id = 'plantVarietyDropdown';
    dropdown.innerHTML = `
        <option value="" selected disabled>Select variety</option>
        ${varieties.map(v => `<option value="${v}">${v}</option>`).join('')}
        <option value="Other">Other (specify)</option>
    `;

    // Insert dropdown
    plantVarietyContainer.appendChild(dropdown);

    // Handle "Other" selection
    dropdown.addEventListener('change', (e) => {
        if (e.target.value === 'Other') {
            dropdown.remove();
            plantVarietyInput.style.display = 'block';
            plantVarietyInput.value = '';
            plantVarietyInput.focus();
        }
    });
}

// ======================
// Disease Analysis Functions
// ======================

async function analyzePlantDisease(imageFile, plantType, symptoms) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const base64String = event.target.result;
                const result = await analyzeWithQwenVL(base64String, plantType, symptoms);
                resolve(result);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read image file'));
        reader.readAsDataURL(imageFile);
    });
}

// Updated analyzeWithQwenVL function with better error handling
async function analyzeWithQwenVL(imageBase64, plantType, symptoms) {
    try {
        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${IMAGE_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.href,
                'X-Title': 'TAPE - Plant Disease Detection'
            },
            body: JSON.stringify({
                model: "qwen/qwen-vl-plus",
                messages: [
                    {
                        role: "system",
                        content: "You are a plant pathologist AI. Analyze images and provide detailed disease diagnoses with treatment plans."
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `Analyze this ${plantType || 'plant'} image. Reported symptoms: ${symptoms || 'none'}. Provide diagnosis and treatment.`
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: imageBase64,
                                    detail: "high"
                                }
                            }
                        ]
                    }
                ],
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`API Error: ${errorData.error?.message || response.status}`);
        }

        const data = await response.json();
        
        // Check if response has the expected structure
        if (!data?.choices?.[0]?.message?.content) {
            console.error("Unexpected API response:", data);
            throw new Error("Received incomplete data from the API");
        }

        return data.choices[0].message.content;

    } catch (error) {
        console.error("Analysis failed:", error);
        throw new Error(`Analysis failed: ${error.message}`);
    }
}

// Updated verifyWithChatbot function
async function verifyWithChatbot(analysisText) {
    try {
        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TEXT_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "anthropic/claude-3-sonnet",
                messages: [{
                    role: "user",
                    content: `Verify this plant disease analysis:\n\n${analysisText}\n\nHighlight any inconsistencies.`
                }]
            })
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        
        const data = await response.json();
        return data.choices?.[0]?.message?.content || analysisText; // Fallback to original if verification fails

    } catch (error) {
        console.error("Verification failed, using original analysis:", error);
        return analysisText; // Return original analysis if verification fails
    }
}

// ======================
// Plant Simulation Function
// ======================

async function runPlantSimulation(formData) {
    // Show loading state
    resultBox.innerHTML = `
        <div class="simulation-loading">
            <i class="fas fa-seedling pulse"></i>
            <p>Simulating ${formData.plantType}'s growth patterns...</p>
            <small>Analyzing ${formData.soilType} soil with ${formData.sunlight} light</small>
        </div>
    `;

    try {
        const prompt = `
You are a plant growth simulation AI for the Technology Assisted Plant Emulator (TAPE). Provide a detailed, scientifically accurate prediction of the growth outcomes for the specified plant under the given conditions. Format the response in markdown with clear headings (##) and bullet points (-) for each section. Include specific numbers, timelines, and care recommendations. If the conditions are suboptimal, highlight potential issues with a warning (!). Structure the response as follows:

1. **Overview**: Summarize the plant and conditions.
2. **Growth Prediction**: Predict growth rate, expected height, and time to maturity.
3. **Environmental Analysis**: Assess suitability of temperature, humidity, soil, sunlight, and watering.
4. **Care Recommendations**: Provide actionable advice to optimize growth.
5. **Potential Issues**: Highlight any risks or challenges based on the inputs.

**Input Parameters**:
- Plant Type: ${formData.plantType}
- Variety: ${formData.plantVariety || 'Standard'}
- Placement: ${formData.placement}
- Soil Type: ${formData.soilType}
- Watering Schedule: ${formData.watering}
- Sunlight Exposure: ${formData.sunlight}
- Temperature Range: ${formData.temperature}°C
- Humidity: ${formData.humidity}
- Growth Stage: ${formData.growthStage}
- Additional Notes: ${formData.notes}

Provide a concise yet detailed response (200-400 words) with specific timelines (e.g., weeks/months) and measurements (e.g., cm/inches).
        `;

        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TEXT_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.href,
                'X-Title': 'TAPE - Technology Assisted Plant Emulator'
            },
            body: JSON.stringify({
                model: "openai/gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are a plant growth simulation AI. Provide detailed, scientifically accurate predictions formatted with markdown-style headings and lists. Always include specific numbers and timelines."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `API error: ${response.status}`);
        }

        const data = await response.json();
        if (!data.choices?.[0]?.message?.content) {
            throw new Error('Invalid API response: No content received');
        }

        const simulationResult = data.choices[0].message.content;
        const formattedResult = formatSimulationResult(simulationResult);
        
        resultBox.innerHTML = `
            <div class="simulation-result">
                <div class="result-header">
                    <h3><i class="fas fa-chart-line"></i> ${formData.plantType} ${formData.plantVariety || 'Standard'} Growth Simulation</h3>
                    <small>Generated at ${new Date().toLocaleTimeString()}</small>
                </div>
                ${formattedResult}
                <button class="btn" onclick="window.print()"><i class="fas fa-print"></i> Print Report</button>
            </div>
        `;

        saveSimulation({
            plant: `${formData.plantType} ${formData.plantVariety || 'Standard'}`,
            conditions: `${formData.temperature}°C, ${formData.humidity}% humidity`,
            summary: simulationResult.substring(0, 150) + '...'
        });

    } catch (error) {
        console.error('Simulation error:', error);
        resultBox.innerHTML = `
            <div class="simulation-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Simulation Failed</p>
                <small>${error.message}</small>
                <button class="btn" onclick="location.reload()"><i class="fas fa-sync-alt"></i> Try Again</button>
            </div>
        `;
    }
}

// ======================
// Event Listeners
// ======================

// Navigation
navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        setActiveSection(link.dataset.section);
    });
});

// Theme toggle
themeToggle.addEventListener('click', toggleTheme);

// Section buttons
document.querySelectorAll('[data-section]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (btn.tagName === 'A') {
            e.preventDefault();
            setActiveSection(btn.dataset.section);
        }
    });
});

// Plant type input with variety dropdown
plantTypeInput.addEventListener('input', debounce(async (e) => {
    const plantName = e.target.value.trim();
    if (plantName.length < 3) {
        const dropdown = plantVarietyContainer.querySelector('select');
        if (dropdown) dropdown.remove();
        plantVarietyInput.style.display = 'block';
        return;
    }

    const loadingSpan = document.createElement('span');
    loadingSpan.className = 'loading-text';
    loadingSpan.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading varieties...';
    plantVarietyContainer.appendChild(loadingSpan);

    try {
        const varieties = await fetchPlantVarieties(plantName);
        createVarietyDropdown(varieties);
    } catch (error) {
        console.error('Failed to load varieties:', error);
        plantVarietyInput.style.display = 'block';
    } finally {
        loadingSpan.remove();
    }
}));

// Simulation form
simulateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Cooldown check
    const now = Date.now();
    if (now - lastSimulationTime < SIMULATION_COOLDOWN) {
        resultBox.innerHTML = `<div class="simulation-warning">
            <i class="fas fa-clock"></i>
            <p>Please wait ${Math.ceil((SIMULATION_COOLDOWN - (now - lastSimulationTime)) / 1000)} seconds before running another simulation</p>
        </div>`;
        return;
    }
    lastSimulationTime = now;

    // Get variety from either dropdown or input
    const varietyDropdown = document.getElementById('plantVarietyDropdown');
    const plantVariety = varietyDropdown ? 
        (varietyDropdown.value === 'Other' ? plantVarietyInput.value : varietyDropdown.value) :
        plantVarietyInput.value;

    // Validate variety selection
    if (varietyDropdown && !varietyDropdown.value && !plantVarietyInput.value) {
        resultBox.innerHTML = `<div class="simulation-error">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Please select a plant variety or choose "Other"</p>
        </div>`;
        return;
    }

    // Collect form data
    const formData = {
        plantType: plantTypeInput.value.trim(),
        plantVariety: plantVariety.trim(),
        placement: document.getElementById('placement').value,
        soilType: document.getElementById('soilType').value,
        watering: document.getElementById('watering').value.trim(),
        sunlight: document.getElementById('sunlight').value.trim(),
        temperature: document.getElementById('temperature').value.trim(),
        humidity: document.getElementById('humidity').value.trim(),
        growthStage: document.getElementById('growthStage').value || 'not specified',
        notes: document.getElementById('notes').value.trim() || 'None'
    };

    // Input validation
    const validationError = validateInputs(formData);
    if (validationError) {
        resultBox.innerHTML = `<div class="simulation-error">
            <i class="fas fa-exclamation-triangle"></i>
            <p>${validationError}</p>
        </div>`;
        return;
    }

    // Temperature range validation
    const [minTemp, maxTemp] = formData.temperature.split('-').map(Number);
    if (isNaN(minTemp) || isNaN(maxTemp) || minTemp >= maxTemp) {
        resultBox.innerHTML = `<div class="simulation-error">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Temperature must be a valid range (e.g., 18-24)</p>
        </div>`;
        return;
    }

    await runPlantSimulation(formData);
});

// Disease form
diseaseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Cooldown check
    const now = Date.now();
    if (now - lastDiseaseAnalysisTime < DISEASE_COOLDOWN) {
        diseaseResultBox.innerHTML = `<div class="simulation-warning">
            <i class="fas fa-clock"></i>
            <p>Please wait ${Math.ceil((DISEASE_COOLDOWN - (now - lastDiseaseAnalysisTime)) / 1000)} seconds before another analysis</p>
        </div>`;
        return;
    }
    lastDiseaseAnalysisTime = now;

    const imageFile = plantImageInput.files[0];
    if (!imageFile) {
        diseaseResultBox.innerHTML = `<div class="simulation-error">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Please select an image to analyze</p>
        </div>`;
        return;
    }

    // Show loading state
    diseaseResultBox.innerHTML = `
        <div class="simulation-loading">
            <i class="fas fa-microscope pulse"></i>
            <p>Analyzing plant health...</p>
            <small>Examining ${imageFile.name} for disease patterns</small>
        </div>
    `;

    try {
        // Step 1: Initial analysis with Qwen-VL
        const analysisResult = await analyzePlantDisease(
            imageFile,
            plantTypeDiseaseInput.value.trim(),
            symptomsInput.value.trim()
        );

        // Step 2: Verification with Claude-3 (optional)
        const verifiedResult = await verifyWithChatbot(analysisResult);
        
        const formattedResult = formatDiseaseResult(verifiedResult);
        
        diseaseResultBox.innerHTML = `
            <div class="simulation-result">
                <div class="result-header">
                    <h3><i class="fas fa-diagnoses"></i> Plant Health Analysis</h3>
                    <small>Analyzed at ${new Date().toLocaleTimeString()}</small>
                </div>
                ${formattedResult}
                <button class="btn" onclick="window.print()"><i class="fas fa-print"></i> Print Report</button>
            </div>
        `;

        saveSimulation({
            type: 'disease_analysis',
            plant: plantTypeDiseaseInput.value.trim() || 'Unknown',
            summary: verifiedResult.substring(0, 150) + '...'
        });

    } catch (error) {
        console.error('Disease analysis error:', error);
        diseaseResultBox.innerHTML = `
            <div class="simulation-error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Analysis Failed</p>
                <small>${error.message}</small>
                <button class="btn" onclick="location.reload()"><i class="fas fa-sync-alt"></i> Try Again</button>
            </div>
        `;
    }
});

// ======================
// Initialization
// ======================

// Set initial theme
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
} else {
    themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
}

// Initialize active section
setActiveSection('home');