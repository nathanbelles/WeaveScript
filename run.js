import { WeaveScriptEvaluator } from "./evaluator.js";

/**
 * @typedef {object} StoryCard
 * @property {number} id A unique numerical id for the story card
 * @property {Date} createdAt The date and time the story card was created
 * @property {Date} updatedAt The date and time the story card was last updated
 * @property {string} keys Comma-separated keys that should cause the story card to be included in the model context
 * @property {string} entry The text that should be included in the model context if the story card is included
 * @property {string} type A text field that can be used to separate story cards into categories
 * @property {string} title The title of the story card
 * @property {string} description Story card description/notes
 * @property {boolean} useForCharacterCreation Whether the story card should be used in the character creator
 * @property {number} [index] Optional explicit index (fallbacks to iteration index)
 * @property {Set<string>} [tags] Optional. The same as keys, but as a Set
 */

/**
 * Runs WeaveScript initialization for the main scenario sections.
 * Evaluates Plot Essentials, Author's Note, and then updates story cards.
 *
 * @returns {void}
 */
export function init() {
    const plotEssentials = state.memory.context;
    const authorsNote = state.memory.authorsNote;
    state.memory.context = WeaveScriptEvaluator.runScript(plotEssentials);
    state.memory.authorsNote = WeaveScriptEvaluator.runScript(authorsNote);
    this.updateStoryCards(storyCards);
}

/**
 * Rewrites story card entries that opt in to WeaveScript with
 * `#{EnableWeaveScript: true}` at the start of their description.
 *
 * For each opted-in card, the portion of `description` after the marker is
 * evaluated as WeaveScript and wrapped in `#{...}`. If the card `entry` already
 * contains a `#{...}` block, the first one is replaced; otherwise the new block
 * is appended to the end of the entry.
 *
 * @param {StoryCard[]} storyCards Story cards to scan/update.
 * @returns {void}
 */
export function updateStoryCards(storyCards) {
    
    /** @type {string} Story card marker that enables WeaveScript processing. */
    const ENABLE_ON_STORYCARD = '#{EnableWeaveScript: true}';
    /** @type {string} Opening delimiter for generated story card script content. */
    const STORYCARD_START = "#{";
    /** @type {string} Closing delimiter for generated story card script content. */
    const STORYCARD_END = "}";
    /** @type {RegExp} Matches the first script block in a story card entry. */
    const STORYCARD_REGEX = /#{.*}/s;

    for(const [index, storyCard] of storyCards.entries()) {
        let description = storyCard.description;
        if(description.startsWith(ENABLE_ON_STORYCARD)) {
            description = description.slice(ENABLE_ON_STORYCARD.length);
            const update = `${STORYCARD_START}${WeaveScriptEvaluator.runScript(description)}${STORYCARD_END}`;
            let newEntry = storyCard.entry;
            if(STORYCARD_REGEX.test(storyCard.entry)) {
                newEntry = storyCard.entry.replace(STORYCARD_REGEX, update);
            } else {
                newEntry = storyCard.entry + update;
            }
            updateStoryCard(storyCard?.index ?? index, storyCard.keys, newEntry, storyCard.type);
        }
    }
}

/**
 * Updates only the story cards whose tags are mentioned in `text`.
 *
 * Tags are extracted from each story card's `keys` (comma-separated list),
 * then `text` is scanned for any of those tags. Any card with at least one
 * matched tag is passed to `updateStoryCards`.
 *
 * @param {string} text The text to scan for story card tags.
 * @returns {void}
 */
export function updateTriggeredStoryCards(text) {
    const splitTags = storyCards.map((card,i) => ({...card, index: i, tags: card.keys.split(',')}));
    const allTags = [...new Set(splitTags.flatMap(card => card.tags))];
    const regex = new RegExp(allTags.map( s=> s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
    const matched = new Set(text.match(regex) || []);
    const triggered = splitTags.filter(card => card.tags.some(tag => matched.has(tag)));
    updateStoryCards(triggered);
}
