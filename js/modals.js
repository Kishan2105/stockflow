// Modal utilities
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.open').forEach(modal => {
            modal.classList.remove('open');
        });
    }
});

// Convenience function to open modal
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
}