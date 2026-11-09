/**
 * Emotion words, written for ProsePrince: the names of feelings a narrator might state instead of
 * showing ("she was furious", "a wave of relief"). Self-Editing for Fiction Writers (Browne & King,
 * ch. 1) calls the habit explaining: the scene usually already shows the feeling. Matched by lemma
 * and surface form, in narration only.
 */
export const EMOTIONS: ReadonlySet<string> = new Set(`
afraid aghast agitated agitation alarm alarmed amused amusement anger angry anguish anguished annoyance annoyed anxiety anxious apprehension
apprehensive ashamed awe bewildered bewilderment bitterness bored boredom calm calmness cheerful cheerfulness confused confusion contempt
content contentment curiosity curious dejected delight delighted depressed depression desolate desolation despair desperate desperation
devastated disappointed disappointment discomfort disgust disgusted dismay dismayed distress distressed dread eager eagerness elated elation
embarrassed embarrassment enraged envious envy euphoria euphoric exasperated exasperation excited excitement exhilarated exhilaration fear
fearful frightened frustrated frustration fury furious glad gladness glee gleeful gloomy grateful gratitude grief grieving guilt guilty
happiness happy hatred helpless helplessness homesick homesickness hopeful hopeless hopelessness horrified horror hostile hostility
humiliated humiliation hurt impatience impatient indignant indignation insecure insecurity irritated irritation jealous jealousy joy joyful
lonely loneliness longing melancholy miserable misery mortified mortification nervous nervousness nostalgia nostalgic outrage outraged
overjoyed overwhelmed panic panicked pity proud pride rage regret regretful relief relieved remorse remorseful resentful resentment restless
sad sadness satisfaction satisfied scared shame shocked sorrow sorrowful surprised suspicious suspicion sympathy tense tension terrified
terror thrilled uneasy unease unhappy upset vulnerable weary worried worry wrath
`.trim().split(/\s+/));
