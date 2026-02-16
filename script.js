// --- Configuration ---
// Replace with your actual backend API base URL (the one serving /api/options)
const API_BASE_URL = 'https://kaung.tail6b5138.ts.net';
const OPTIONS_URL = API_BASE_URL + '/api/options';

// --- Global state ---
let optionsData = null;
let currentSelections = {
    exam: '',
    board: '',
    subject: '',
    year: '',
    month: '',
    paper: ''
};

// --- Telegram WebApp initialization ---
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand(); // Expand to full height

// --- DOM elements ---
const loader = document.getElementById('loader');
const filtersDiv = document.getElementById('filters');
const examSelect = document.getElementById('exam');
const boardSelect = document.getElementById('board');
const subjectSelect = document.getElementById('subject');
const yearSelect = document.getElementById('year');
const monthSelect = document.getElementById('month');
const paperSelect = document.getElementById('paper');
const downloadBtn = document.getElementById('downloadBtn');
const fileTypeRadios = document.getElementsByName('fileType');

// --- Helper: populate select with options ---
function populateSelect(select, values, placeholder = 'Select option') {
    select.innerHTML = '';
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = placeholder;
    placeholderOption.disabled = true;
    placeholderOption.selected = true;
    select.appendChild(placeholderOption);

    if (values && values.length) {
        values.forEach(val => {
            const option = document.createElement('option');
            option.value = val;
            option.textContent = val;
            select.appendChild(option);
        });
        select.disabled = false;
    } else {
        select.disabled = true;
    }
}

// --- Fetch options from backend ---
async function loadOptions() {
    try {
        const response = await fetch(OPTIONS_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        optionsData = await response.json();
        loader.style.display = 'none';
        filtersDiv.style.display = 'block';

        // Populate exam dropdown
        const exams = Object.keys(optionsData).sort();
        populateSelect(examSelect, exams, 'Select exam');
        examSelect.disabled = false;

        // Listen for changes
        setupEventListeners();
    } catch (err) {
        loader.innerHTML = `<div class="error">❌ Failed to load options. Please try again later.<br><small>${err.message}</small></div>`;
        console.error(err);
    }
}

// --- Update dependent dropdowns based on current selections ---
function updateDropdowns() {
    const { exam, board, subject, year, month } = currentSelections;

    // --- Board dropdown ---
    if (exam && optionsData[exam]) {
        const boards = Object.keys(optionsData[exam]).sort();
        populateSelect(boardSelect, boards, 'Select board');
        if (board && boards.includes(board)) {
            boardSelect.value = board;
        } else {
            boardSelect.value = '';
        }
    } else {
        populateSelect(boardSelect, [], 'Select board');
        boardSelect.value = '';
    }

    // --- Subject dropdown ---
    if (exam && board && optionsData[exam]?.[board]) {
        const subjects = Object.keys(optionsData[exam][board]).sort();
        populateSelect(subjectSelect, subjects, 'Select subject');
        if (subject && subjects.includes(subject)) {
            subjectSelect.value = subject;
        } else {
            subjectSelect.value = '';
        }
    } else {
        populateSelect(subjectSelect, [], 'Select subject');
        subjectSelect.value = '';
    }

    // --- Year dropdown ---
    if (exam && board && subject && optionsData[exam]?.[board]?.[subject]) {
        const years = Object.keys(optionsData[exam][board][subject]).sort().reverse();
        populateSelect(yearSelect, years, 'Select year');
        if (year && years.includes(year)) {
            yearSelect.value = year;
        } else {
            yearSelect.value = '';
        }
    } else {
        populateSelect(yearSelect, [], 'Select year');
        yearSelect.value = '';
    }

    // --- Month dropdown ---
    if (exam && board && subject && year && optionsData[exam]?.[board]?.[subject]?.[year]) {
        const months = Object.keys(optionsData[exam][board][subject][year]).sort();
        populateSelect(monthSelect, months, 'Select month');
        if (month && months.includes(month)) {
            monthSelect.value = month;
        } else {
            monthSelect.value = '';
        }
    } else {
        populateSelect(monthSelect, [], 'Select month');
        monthSelect.value = '';
    }

    // --- Paper dropdown ---
    if (exam && board && subject && year && month && optionsData[exam]?.[board]?.[subject]?.[year]?.[month]) {
        const papers = optionsData[exam][board][subject][year][month];
        populateSelect(paperSelect, papers, 'Select paper');
        // Keep the existing paper selection if it's still valid
        const currentPaper = currentSelections.paper;
        if (currentPaper && papers.includes(currentPaper)) {
            paperSelect.value = currentPaper;
        } else {
            paperSelect.value = '';
            currentSelections.paper = ''; // reset if invalid
        }
    } else {
        populateSelect(paperSelect, [], 'Select paper');
        paperSelect.value = '';
        currentSelections.paper = '';
    }

    // Enable download button only when all selections are made
    const allSelected = exam && board && subject && year && month && paperSelect.value;
    downloadBtn.disabled = !allSelected;
}

// --- Event listeners for dropdowns ---
function setupEventListeners() {
    examSelect.addEventListener('change', (e) => {
        currentSelections.exam = e.target.value;
        // Reset dependent selections
        currentSelections.board = '';
        currentSelections.subject = '';
        currentSelections.year = '';
        currentSelections.month = '';
        currentSelections.paper = '';
        boardSelect.value = '';
        subjectSelect.value = '';
        yearSelect.value = '';
        monthSelect.value = '';
        paperSelect.value = '';
        updateDropdowns();
    });

    boardSelect.addEventListener('change', (e) => {
        currentSelections.board = e.target.value;
        currentSelections.subject = '';
        currentSelections.year = '';
        currentSelections.month = '';
        currentSelections.paper = '';
        subjectSelect.value = '';
        yearSelect.value = '';
        monthSelect.value = '';
        paperSelect.value = '';
        updateDropdowns();
    });

    subjectSelect.addEventListener('change', (e) => {
        currentSelections.subject = e.target.value;
        currentSelections.year = '';
        currentSelections.month = '';
        currentSelections.paper = '';
        yearSelect.value = '';
        monthSelect.value = '';
        paperSelect.value = '';
        updateDropdowns();
    });

    yearSelect.addEventListener('change', (e) => {
        currentSelections.year = e.target.value;
        currentSelections.month = '';
        currentSelections.paper = '';
        monthSelect.value = '';
        paperSelect.value = '';
        updateDropdowns();
    });

    monthSelect.addEventListener('change', (e) => {
        currentSelections.month = e.target.value;
        currentSelections.paper = '';
        paperSelect.value = '';
        updateDropdowns();
    });

    paperSelect.addEventListener('change', (e) => {
        currentSelections.paper = e.target.value;
        updateDropdowns();
    });
}

// --- Handle download button click ---
downloadBtn.addEventListener('click', () => {
    console.log("✅ Download button clicked");
    const fileType = Array.from(fileTypeRadios).find(r => r.checked)?.value;
    if (!fileType) {
        tg.showAlert('Please select a file type.');
        return;
    }

    const payload = {
        action: 'download_paper',
        exam: currentSelections.exam,
        board: currentSelections.board,
        subject: currentSelections.subject,
        year: currentSelections.year,
        month: currentSelections.month,
        paper: currentSelections.paper,
        file_type: fileType
    };

    console.log("📦 Sending payload:", payload);
    tg.sendData(JSON.stringify(payload));

    // Optional: show a loading indicator (but sendData closes the web app)
    downloadBtn.disabled = true;
    downloadBtn.textContent = 'Sending...';
});

// --- Start loading options ---
loadOptions();

// --- Handle theme changes (optional) ---
tg.onEvent('themeChanged', function() {
    // If you want to adapt colors dynamically, you can update CSS variables here
    // The CSS already uses var(--tg-theme-*) which update automatically.
});
