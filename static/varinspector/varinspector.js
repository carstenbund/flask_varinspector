// flask_varinspector/static/varinspector/varinspector.js

document.addEventListener('DOMContentLoaded', function() {
    // Load the global variables when the DOM is ready
    function loadGlobals() {
        fetch('/varinspector/globals')
            .then(response => response.json())
            .then(data => {
                const globalsList = document.getElementById('globals-list');
                globalsList.innerHTML = ''; // Clear the list first

                // For each global variable name, create a clickable entry
                data.globals.forEach(function(varName) {
                    const listItem = document.createElement('li');

                    const varLink = document.createElement('span');
                    varLink.classList.add('variable');
                    varLink.textContent = varName;

                    // Attach an event to inspect the variable on click
                    varLink.addEventListener('click', function(e) {
                        e.stopPropagation(); // Prevent event bubbling
                        toggleInspect(varName, listItem);
                    });

                    listItem.appendChild(varLink);
                    globalsList.appendChild(listItem);
                });
            })
            .catch(error => {
                console.error('Error fetching globals:', error);
            });
    }

    /**
     * toggleInspect: Main function to fetch and display variable details.
     * - path: The string representing the variable path in the backend.
     * - listItem: The <li> element to populate with details.
     */
    function toggleInspect(path, listItem) {
        if (listItem.classList.contains('expanded')) {
            // Collapse the existing expansion
            listItem.classList.remove('expanded');
            const detailsDiv = listItem.querySelector(':scope > .details');
            if (detailsDiv) {
                listItem.removeChild(detailsDiv);
            }
            return;
        }
        
        // Mark this item as expanded
        listItem.classList.add('expanded');
        
        // Create a details container
        const detailsDiv = document.createElement('div');
        detailsDiv.classList.add('details');
        
        // Show loading status
        const loadingSpan = document.createElement('span');
        loadingSpan.classList.add('loading');
        loadingSpan.textContent = 'Loading...';
        detailsDiv.appendChild(loadingSpan);
        
        // Append the container to the list item
        listItem.appendChild(detailsDiv);
        
        // Fetch variable details from the backend
        fetch(`/varinspector/inspect?path=${encodeURIComponent(path)}`)
        .then(response => response.json())
        .then(data => {
            // Remove loading text
            detailsDiv.innerHTML = '';
            
            // Check for a server-side error
            if (data.error) {
                const errorP = document.createElement('p');
                errorP.style.color = 'red';
                errorP.textContent = data.error;
                detailsDiv.appendChild(errorP);
                return;
            }
            
            // The main details object from the backend
            const details = data.details;
            
            // Depending on the backend’s data structure:
            // -------------------------------------------
            // If you prefer NOT to display "Type:", "Value:", or "Length:" at all,
            // simply skip them. If you want them to appear once the user expands
            // further, put them inside your build* helper functions instead.
            
            // Distinguish data types and build child elements accordingly
            if ((details.type === 'list' || details.type === 'tuple') && 'length' in details) {
                buildListElements(details, path, detailsDiv);
            }
            else if (details.type === 'dict' && details.keys) {
                buildDictElements(details, path, detailsDiv);
            }
            else if ((details.type === 'object' || details.type === 'class') && details.attributes) {
                buildObjectAttributes(details, path, detailsDiv);
            }
            else if (('keys' in details) || ('attributes' in details)) {
                // Some backends might return keys/attributes separately
                buildAttributesOrKeys(details, path, detailsDiv);
            }
            else {
                // Fallback for unsupported or empty structures
                const fallbackMsg = document.createElement('p');
                fallbackMsg.textContent = 'No further details to display.';
                detailsDiv.appendChild(fallbackMsg);
            }
        })
        .catch(error => {
            detailsDiv.innerHTML = '';
            const errorP = document.createElement('p');
            errorP.style.color = 'red';
            errorP.textContent = 'Failed to fetch variable details.';
            detailsDiv.appendChild(errorP);
            console.error('Error fetching variable details:', error);
        });
    }


    /**
     * Build elements for lists (or tuples).
     */
    function buildListElements(details, path, container) {
        if (details.length === 0) {
            const emptyMsg = document.createElement('p');
            emptyMsg.textContent = 'This list/tuple is empty.';
            container.appendChild(emptyMsg);
            return;
        }

        const childList = document.createElement('ul');
        for (let i = 0; i < details.length; i++) {
            const childItem = document.createElement('li');
            const childPath = `${path}[${i}]`;

            const childLink = document.createElement('span');
            childLink.classList.add('variable');
            childLink.textContent = `[${i}]`;

            // On click, drill down further
            childLink.addEventListener('click', function(e) {
                e.stopPropagation();
                toggleInspect(childPath, childItem);
            });

            childItem.appendChild(childLink);
            childList.appendChild(childItem);
        }
        container.appendChild(childList);
    }

    /**
     * Build elements for dictionaries.
     * Expects { type: 'dict', keys: [...], items: {...} } or at least .keys array from the backend.
     */
    function buildDictElements(details, path, container) {
        const { keys } = details;
        if (!keys.length) {
            const emptyMsg = document.createElement('p');
            emptyMsg.textContent = 'This dictionary is empty.';
            container.appendChild(emptyMsg);
            return;
        }

        const childList = document.createElement('ul');
        for (const key of keys) {
            const childItem = document.createElement('li');
            const childPath = `${path}["${key}"]`; // Use bracket notation for dictionary keys

            const childLink = document.createElement('span');
            childLink.classList.add('variable');
            childLink.textContent = key;

            childLink.addEventListener('click', function(e) {
                e.stopPropagation();
                toggleInspect(childPath, childItem);
            });

            childItem.appendChild(childLink);
            childList.appendChild(childItem);
        }
        container.appendChild(childList);
    }

    /**
     * Build elements for objects/classes with attributes.
     * Expects details.attributes to be an object mapping attrName -> {type, value, etc.}
     */
    function buildObjectAttributes(details, path, container) {
        const attrs = details.attributes;
        const attrNames = Object.keys(attrs);

        if (!attrNames.length) {
            const noAttrs = document.createElement('p');
            noAttrs.textContent = 'No attributes found.';
            container.appendChild(noAttrs);
            return;
        }

        const childList = document.createElement('ul');
        for (const attr of attrNames) {
            const childItem = document.createElement('li');
            const childPath = `${path}.${attr}`; // Dot notation for object attributes

            const childLink = document.createElement('span');
            childLink.classList.add('variable');
            
            const attrType = attrs[attr].type || 'attribute';
            childLink.textContent = `${attr} (${attrType})`;

            if (attrType === 'object' || attrType === 'class' || attrType === 'dict' || attrType === 'list' || attrType === 'tuple') {
                childLink.addEventListener('click', function(e) {
                    e.stopPropagation();
                    toggleInspect(childPath, childItem);
                });
            }
            else if ('value' in attrs[attr]) {
                // If it's a primitive, optionally display its value immediately
                const valueP = document.createElement('p');
                valueP.textContent = `Value: ${attrs[attr].value}`;
                childItem.appendChild(valueP);
            }

            childItem.appendChild(childLink);
            childList.appendChild(childItem);
        }
        container.appendChild(childList);
    }

    /**
     * Build child elements for scenarios where the backend returns raw 'keys' or 'attributes' arrays
     * instead of the objects used above.
     */
    function buildAttributesOrKeys(details, path, container) {
        const childList = document.createElement('ul');
        let items = [];

        if (details.keys) {
            items = details.keys.map(key => ({ name: key, type: 'key' }));
        } else if (details.attributes) {
            items = details.attributes.map(attr => ({ name: attr, type: 'attribute' }));
        }

        if (!items.length) {
            const emptyMessage = document.createElement('p');
            emptyMessage.textContent = 'No keys or attributes found.';
            container.appendChild(emptyMessage);
            return;
        }

        items.forEach(child => {
            const childItem = document.createElement('li');
            let childPath;

            // Use bracket notation for everything that isn't obviously a numeric index
            if (!isNaN(child.name)) {
                childPath = `${path}[${child.name}]`;
            } else {
                childPath = `${path}["${child.name}"]`;
            }

            const childLink = document.createElement('span');
            childLink.classList.add('variable');
            childLink.textContent = child.name;

            childLink.addEventListener('click', function(e) {
                e.stopPropagation();
                toggleInspect(childPath, childItem);
            });

            childItem.appendChild(childLink);
            childList.appendChild(childItem);
        });

        container.appendChild(childList);
    }

    // Finally, call loadGlobals to initialize the page
    loadGlobals();
});
