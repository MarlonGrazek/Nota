/**
 * TooltipManager
 * Manages the creation, positioning, and lifecycle of tooltips.
 * Built from scratch to be robust, predictable, and fully controllable.
 */
const TooltipManager = {
    // Reference to the currently visible tooltip element.
    activeTooltip: null,
    // Reference to the element the tooltip is for.
    activeTarget: null,
    // Timeout ID for hiding the tooltip.
    hideTimeout: null,
    // A small gap between the target and the tooltip.
    offset: 12,

    /**
     * Initializes the tooltip system by adding global event listeners.
     */
    init() {
        document.body.addEventListener('mouseover', this.handleMouseOver.bind(this));
        document.body.addEventListener('mouseout', this.handleMouseOut.bind(this));

        // Observer to automatically hide the tooltip if its target is removed from the DOM.
        const observer = new MutationObserver(() => {
            if (this.activeTarget && !document.body.contains(this.activeTarget)) {
                this.hide(true); // Hide immediately
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        console.log("New TooltipManager initialized successfully.");
    },

    /**
     * Handles mouseover events to show or maintain the tooltip.
     */
    handleMouseOver(event) {
        const newTarget = event.target.closest('[data-tooltip]');
        const isOverTooltip = event.target.closest('.custom-tooltip');

        if (newTarget) {
            // If we hover over a new target, show its tooltip.
            if (newTarget !== this.activeTarget) {
                this.show(newTarget);
            } else {
                // If we hover back to the same target, cancel any pending hide command.
                this.clearHideTimeout();
            }
            return;
        }

        // If we hover over the tooltip itself, cancel any pending hide command.
        if (isOverTooltip) {
            this.clearHideTimeout();
        }
    },

    /**
     * Handles mouseout events to hide the tooltip when appropriate.
     */
    handleMouseOut(event) {
        if (!this.activeTarget) return;

        const relatedTarget = event.relatedTarget;

        // If the mouse leaves the window, start the hide process.
        if (!relatedTarget) {
            this.startHideTimeout();
            return;
        }

        // Check if the mouse is still inside the target element OR the tooltip.
        const isStillOverTarget = this.activeTarget.contains(relatedTarget);
        const isStillOverTooltip = this.activeTooltip && this.activeTooltip.contains(relatedTarget);

        // Only start the hide process if the mouse has left BOTH the target and the tooltip.
        if (!isStillOverTarget && !isStillOverTooltip) {
            this.startHideTimeout();
        }
    },

    /**
     * Creates and displays a new tooltip for a given target element.
     * @param {HTMLElement} target The element to show the tooltip for.
     */
    show(target) {
        // Hide any existing tooltip immediately.
        if (this.activeTooltip) {
            this.hide(true);
        }
        this.clearHideTimeout();

        this.activeTarget = target;
        const text = target.dataset.tooltip;

        const tooltip = document.createElement('div');
        tooltip.className = 'custom-tooltip';
        tooltip.innerHTML = text;

        document.body.appendChild(tooltip);
        this.activeTooltip = tooltip;

        // Position the tooltip and then make it visible.
        this.position(target, tooltip);

        requestAnimationFrame(() => {
            tooltip.classList.add('visible');
        });
    },

    /**
     * Hides the active tooltip.
     * @param {boolean} immediately If true, remove instantly; otherwise, fade out.
     */
    hide(immediately = false) {
        if (!this.activeTooltip) return;

        const tooltipToRemove = this.activeTooltip;
        this.activeTooltip = null;
        this.activeTarget = null;
        this.clearHideTimeout();

        if (immediately) {
            if (tooltipToRemove.parentElement) tooltipToRemove.remove();
        } else {
            tooltipToRemove.classList.remove('visible');
            // Remove from DOM after the fade-out transition completes.
            setTimeout(() => {
                if (tooltipToRemove.parentElement) tooltipToRemove.remove();
            }, 150);
        }
    },

    startHideTimeout() {
        this.clearHideTimeout();
        this.hideTimeout = setTimeout(() => this.hide(false), 100);
    },

    clearHideTimeout() {
        clearTimeout(this.hideTimeout);
    },

    /**
     * Calculates and applies the correct position for the tooltip.
     * @param {HTMLElement} target The element the tooltip belongs to.
     * @param {HTMLElement} tooltip The tooltip element itself.
     */
    position(target, tooltip) {
        const placement = target.dataset.tooltipPlacement || 'auto';
        const targetRect = target.getBoundingClientRect();
        // Get tooltip dimensions AFTER it's been added to the DOM.
        const tooltipRect = tooltip.getBoundingClientRect();

        let finalPos = { top: 0, left: 0 };
        let direction = '';

        switch (placement) {
            case 'top':
                direction = 'top';
                finalPos.top = targetRect.top - tooltipRect.height - this.offset;
                finalPos.left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                break;

            case 'bottom':
                direction = 'bottom';
                finalPos.top = targetRect.bottom + this.offset;
                finalPos.left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                break;

            case 'left':
                direction = 'left';
                finalPos.left = targetRect.left - tooltipRect.width - this.offset;
                finalPos.top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                break;

            case 'right':
                direction = 'right';
                finalPos.left = targetRect.right + this.offset;
                finalPos.top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                break;

            default: // 'auto' with advanced fallback
                const placements = ['bottom', 'top', 'right', 'left'];
                let bestPlacement = 'bottom'; // Default to bottom

                // Find the first placement in the priority list that has enough space
                for (const p of placements) {
                    if (p === 'bottom' && targetRect.bottom + tooltipRect.height + this.offset < window.innerHeight) {
                        bestPlacement = p;
                        break;
                    }
                    if (p === 'top' && targetRect.top - tooltipRect.height - this.offset > 0) {
                        bestPlacement = p;
                        break;
                    }
                    if (p === 'right' && targetRect.right + tooltipRect.width + this.offset < window.innerWidth) {
                        bestPlacement = p;
                        break;
                    }
                    if (p === 'left' && targetRect.left - tooltipRect.width - this.offset > 0) {
                        bestPlacement = p;
                        break;
                    }
                }
                
                direction = bestPlacement;

                // Calculate position based on the determined best placement
                if (direction === 'top' || direction === 'bottom') {
                    finalPos.top = direction === 'top' ? targetRect.top - tooltipRect.height - this.offset : targetRect.bottom + this.offset;
                    finalPos.left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
                } else { // 'left' or 'right'
                    finalPos.left = direction === 'left' ? targetRect.left - tooltipRect.width - this.offset : targetRect.right + this.offset;
                    finalPos.top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
                }
                break;
        }

        tooltip.dataset.direction = direction;

        // --- Boundary Correction ---
        // Ensure the tooltip doesn't go off-screen.
        const boundaryPadding = 4; // KORREKTUR: Abstand zum Bildschirmrand von 10px auf 4px verringert
        finalPos.left = Math.max(boundaryPadding, Math.min(finalPos.left, window.innerWidth - tooltipRect.width - boundaryPadding));
        finalPos.top = Math.max(boundaryPadding, Math.min(finalPos.top, window.innerHeight - tooltipRect.height - boundaryPadding));

        // --- Dynamic Arrow Positioning ---
        // After correcting the box position, calculate where the arrow should be.
        if (direction === 'top' || direction === 'bottom') {
            const targetCenterX = targetRect.left + (targetRect.width / 2);
            const arrowLeft = targetCenterX - finalPos.left;
            tooltip.style.setProperty('--arrow-left', `${arrowLeft}px`);
        } else if (direction === 'left' || direction === 'right') {
            const targetCenterY = targetRect.top + (targetRect.height / 2);
            const arrowTop = targetCenterY - finalPos.top;
            tooltip.style.setProperty('--arrow-top', `${arrowTop}px`);
        }

        tooltip.style.left = `${Math.round(finalPos.left)}px`;
        tooltip.style.top = `${Math.round(finalPos.top)}px`;
    }
};

export default TooltipManager;