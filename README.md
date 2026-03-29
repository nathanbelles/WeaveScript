# WeaveScript 📜

A lightweight scripting layer for AI Dungeon that adds variables, conditionals, and arithmetic to your prompts.

## Adding to AI Dungeon
Below are the steps to add the script to AI Dungeon.  The steps may need to be slightly modified if you wish to combine it with another script.  WeaveScript should be compatible with most other scripts.
1. Access the AI Dungeon website on a PC, or switch your mobile browser to desktop view if necessary.
2. Create a new scenario or open an existing one for editing.
3. At the top of the editor, open the `DETAILS` tab.
4. Scroll to the `Scripting` section and enable `Scripts Enabled.`
5. Click `EDIT SCRIPTS`.
6. In the left panel, select the `Input` tab.
7. Remove all existing code.
8. Paste the following into the empty tab:
   ```js
    const modifier = (text) => {
        if(info.actionCount == 0) {
            //init() will process Plot Essentials, Author's 
            // Note and all story cards on the first turn
            WeaveScript.init();
        }
        //updateTriggeredStoryCards will process any story
        //cards your text has triggered
        WeaveScript.updateTriggeredStoryCards(text);
    
        return { text }
    }

    // Don't modify this part
    modifier(text)
   ```
9.  In the left panel, select the `Output` tab.
10. Remove all existing code.
11. Paste the following into the empty tab:
   ```js
    const modifier = (text) => {
        //updateTriggeredStoryCards will process any story
        //cards the AI's text has triggered
        WeaveScript.updateTriggeredStoryCards(text);

        return { text }
    }

    // Don't modify this part
    modifier(text)
   ```
12. Select the `Library` tab.
13. Remove all existing code.
14. Copy the entire contents from [this file](https://github.com/nathanb-dev/WeaveScript/blob/main/dist/WeaveScript.js) and paste it into the empty Library tab.
15. Finally, click the large yellow SAVE button in the top right corner.

---

## Developing

### Installing dependencies

Run `npm run install`.  This project is currently dependent of `rollup` for deployment, `vitest` for unit tests, and `@vitest/coverage-v8` for unit test coverage reports. 

### Create deployement

To create a deployment, run `npm run build`.  This wil generate `./dist/WeaveScript.js` which will have all the combined libary code.

### Running test cases

To run test cases, run `npm run test`

---

## How it works

AI Dungeon already lets you embed questions like `${Your name:}`, which get replaced with the player's answer before the story runs. WeaveScript adds a second layer on top of that.  Code blocks in `Plot Essentials` and `Author's Note` that start with `#{` and end with `}` are evaluated after AI Dungeon's substitution is done.  Additionally, story cards can also be updated.

For example, if in your Plot Essentials you had

```
Your name:  ${character.name}
Age:        #{set Age=${Your age:}; Age}
Backstory:  #{set Backstory="${Backstory (optional):";if Backstory is blank then "A mysterious past." else Backstory}
Sister's age: #{Age - 5}
```

After AI Dungeon fills in the blanks, your script sees something like:

```
Your name:  Alex
Age:        #{set Age=19; Age}
Backstory: #{set Backstory="";if Backstory is blank then "A mysterious past." else Backstory}
Sister's age: #{Age - 5}
```

WeaveScript will then run on the the Plot Essentials the first turn:

```
Your name:  Alex
Age:        19
Backstory:  A mysterious past.
Sister age: 14
```

---

## Order of evaluation

On initalization, the `Plot Essentials` section is evaluated first, followed by the `Author's Note` section, and then finally any Story Cards.

The order of evaluation for Story Cards is undefined and should not be relied upon.

---

## Story Cards

To integrate WeaveScript in story cards, use the `NOTES` section.  The `NOTES` section **must** start with `#{EnableWeaveScript: true}` to enable scripting.  Then, on the first turn and whenever the story card is triggered, any text  in the `ENTRY` between the first `#{` and `}` will be replaced.  Please note the output of the story card might be messed up if you have a `}` inside this text

---

## Code blocks

Everything inside `#{` and `}` is WeaveScript. The block is replaced by whatever value it produces.

```
#{  ...code...  }
```

A block can contain a single expression:

```
#{42}
#{Age - 5}
#{"Hello, " + Name}
```

Or multiple statements separated by semicolons, where the **last expression** becomes the output:

```
#{var Age = 19; Age}
```

A block that contains only variable declarations produces no output (empty string).

---

## Variables

Variables let you store a value once and use it many times. They are shared across **all** code blocks, so you can set a variable in one block and read it in another.  Variables are not shared across sections (Plot Essentials, Author's Note, individual Story Cards).

### Declaring a variable

Use either `var` or `set` — they are identical:

```
#{var Age = 19}
#{set Name = "Alex"}
```

Both forms store the value silently (no output). To declare and output at the same time, add the variable name after a semicolon:

```
#{var Age = 19; Age}
```

### Reading a variable

Just write the variable name anywhere an expression is expected:

```
#{Age}
#{Age - 5}
#{if Age >= 18 then "adult" else "minor"}
```

### Reassigning a variable

If you wish to assign a new value to a variable, you must re-declare it.

```
#{var Date="10/10/2025"}
#{Date}
Today nothing happened
#{var Date="10/11/2025"}
#{Date}
Today I ate cheese
```

### Variable types


| Type    | Example values       |
| ------- | -------------------- |
| Number  | `19`, `3.14`, `-7`   |
| String  | `"hello"`, `'world'` |
| Boolean | `true`, `false`      |
| Null    | `null`, `undefined`  |


Variables can hold any of these types. The type is determined by what you assign.

---

## Null literals

WeaveScript supports the null literals `null` and `undefined` (they are treated the same).

### Output and truthiness

- `null` renders as an empty string when output.
- `null` is falsy in conditionals.

```
#{null}                         // outputs nothing
#{if null then "yes" else "no"} // outputs: no
```

### Checking for null

Use comparisons to test whether a value is null:

```
#{var X = null; if X == null then "missing" else X}
```

You can also use the truthiness of null:

```
#{var X = null; if !X then "missing" else X}
```

### Null coalescing operator (`??`)

Use `a ?? b` to provide a fallback when `a` is `null`:

```
#{var Title = null; Title ?? "Untitled"}
#{$sistersName ?? "Your sister"} has the bedroom across from yours.
```

`??` only checks for `null` — it does not treat `false`, `0`, or `""` as missing.

---

## State variables

Regular variables reset every time the script runs and are local to their section. State variables persist across turns and sections; AI Dungeon remembers their value from the last time the script ran, making them useful for tracking things that change over the course of a story.

State variables are prefixed with `$` and do not need to be declared before use:

```
#{$visitCount = 0}
```

Read a state variable the same way you would a regular variable:

```
#{$playerName}
#{if $hasMetKing then "You recognize the king." else "You have never met the king."}
```

### Setting a state variable

Assign to a state variable using `=`:

```
#{$playerName = "Alex"}
#{$triggerCount = $triggerCount + 1}
```

Unlike regular variables, state variables can be reassigned freely:

```
#{$gold = 100}
#{$gold = $gold - 10}
```

### Common uses

**Counters** — track how many times a story card has been triggered:

```
#{$triggerCount = $triggerCount + 1}
You have thought about this tavern #{$triggerCount} times.
```

**Flags** — remember whether something has occurred:

```
#{$hasMetKing = true}
...
#{if $hasMetKing then "You know the king." else "You and the king are strangers."}
```

**Persistent character data** — store values that should survive across scenes:

```
#{$gold = $gold - 50}
You have #{$gold} gold pieces.
```

### Regular variables vs state variables


|                           | Regular variable  | State variable |
| ------------------------- | ----------------- | -------------- |
| Syntax                    | `Name`            | `$Name`        |
| Persists across turns     | No                | Yes            |
| Persists between sections | No                | Yes            |
| Needs declaration         | Yes (`var`/`set`) | No             |
| Can be reassigned         | No                | Yes            |


> **Note:** Reading a state variable that has never been set evaluates to `null`. If you need a default value, initialise it explicitly:
>
> ```
> #{if $visitCount == null then $visitCount = 0}
> #{$visitCount = $visitCount + 1}
> ```

---

## Strings

Strings are text values. They can be written with either double or single quotes — both are equivalent:

```
#{var Greeting = "Hello, world"}
#{var Greeting = 'Hello, world'}
```

### Joining strings

Use `+` to join two strings together:

```
#{"Hello, " + Name}
#{Name + " is " + Age + " years old."}
```

Numbers and booleans are automatically converted to text when joined with a string:

```
#{"Age: " + 19}
#{"Adult: " + true}
```

produces

```
Age: 19
Adult: true
```
### Empty strings

An empty string `""` contains no characters. A string with only spaces is not empty but is considered blank. See [Blank checks](#blank-checks) for how to handle optional AI Dungeon fields that may contain only whitespace.

```
#{if Name == "" then "Unknown"}       // matches only truly empty string
#{if Name is blank then "Unknown"}    // matches empty or whitespace-only
```

### Escape characters

Use a backslash to include special characters inside a string:

|Sequence|Meaning|
|---|---|
|`\"`|Double quote inside a double-quoted string|
|`\'`|Single quote inside a single-quoted string|
|`\\`|Literal backslash|

```
#{var Quote = "She said \"hello\""}
```
---
## Arithmetic

Standard math operators work on numbers:

|Operator|Meaning|Example|Result|
|---|---|---|---|
|`+`|Add|`10 + 5`|`15`|
|`-`|Subtract|`10 - 5`|`5`|
|`*`|Multiply|`10 * 5`|`50`|
|`/`|Divide|`10 / 4`|`2.5`|
|`%`|Remainder|`10 % 3`|`1`|

Parentheses control order of operations:

```
#{(Age - 18) * 2}
```

The `+` operator also works on strings — it joins them together:

```
#{"Age: " + Age}
```

---

## Conditionals

Use `if … then … else …` to choose between two values based on a condition.

```
#{if Age >= 18 then "adult" else "minor"}
#{if Personality is blank then "Mysterious and quiet." else Personality}
```

The `else` part is optional. If you leave it out and the condition is false, the block outputs nothing:

```
#{if HasSword then "You carry a sword."}
```

Conditionals can be nested:

```
#{if Age < 13 then "child" else if Age < 18 then "teenager" else "adult"}
```

### Ternary operator (`? :`)

You can also write conditionals as `condition ? valueIfTrue : valueIfFalse`:

```
#{Age >= 18 ? "adult" : "minor"}
```

In this case the `valueIfFalse` is mandatory.

---

## Comparison operators

Use these inside conditions to compare values:

|Operator|Meaning|Example|
|---|---|---|
|`==`|Equal to|`Name == "Alex"`|
|`!=`|Not equal to|`Gender != "Male"`|
|`<`|Less than|`Age < 18`|
|`>`|Greater than|`Age > 65`|
|`<=`|Less than or equal|`Age <= 12`|
|`>=`|Greater than or equal|`Age >= 18`|

---

## Logical operators

Combine or invert conditions using logical operators. Both the word form and symbol form are accepted — use whichever feels more natural.

| Word form | Symbol form | Meaning                             |
| --------- | ----------- | ----------------------------------- |
| `and`     | `&&`        | Both conditions must be true        |
| `or`      | `\|\|`      | At least one condition must be true |
| `not`     | `!`         | Inverts a condition                 |

```
#{if Age >= 18 and HasLicense then "can drive" else "cannot drive"}
#{if isWarrior or isRogue then "combat trained" else "civilian"}
#{if not HasBackstory then "Origin unknown." else Backstory}
```

---

## Blank checks

AI Dungeon answers are often optional — a player might leave a field empty or type a space. Use `is blank` to catch both cases. A value is blank if it is an empty string or contains only whitespace.

```
#{if Backstory is blank then "A mysterious past." else Backstory}
```

Use `is not blank` to check the opposite:

```
#{if Notes is not blank then Notes else "No additional notes."}
```

> **Tip:** Prefer `is blank` over `== ""` for optional AI Dungeon fields. `== ""` only matches a truly empty string, while `is blank` also catches answers like `" "` where the player hit the spacebar.

---

## Complete example

Here is a full character sheet prompt using WeaveScript

**What AI Dungeon receives:**

```
Your Name: #{var Name="${character.name}"; Name}
Gender: ${Your gender:}
Age: #{var Age=${Your age:}; Age}
Appearance: ${Appearance:}
Personality: #{if "${Personality (optional):}" is blank then "Reserved and calculating" else "${Personality (optional):}"}
Class: #{var Class="${Character class:}"; Class}
Backstory: #{var Backstory="${Backstory (optional):}"; if Backstory is blank then "No one knows where " + Name + " came from." else Backstory}

--- Derived stats ---
Sister's age:  #{Age - 5}
Is adult:      #{if Age >= 18 then "Yes" else "No"}
Is combat class: #{if Class == "Rogue" or Class == "Warrior" then "Yes" else "No"}
```

**After AI Dungeon fills in the blanks:**

```
Your Name: #{var Name="Alex"; Name}
Gender: Male
Age: #{var Age=19; Age}
Appearance: Tall, black hair, sharp eyes
Personality: #{if " " is blank then "Reserved and calculating" else " "}
Class: #{var Class="Rogue"; Class}
Backstory: #{var Backstory="Hails from the depths of hell."; if Backstory is blank then "No one knows where " + Name + " came from." else Backstory}

--- Derived stats ---
Sister's age:  #{Age - 5}
Is adult:      #{if Age >= 18 then "Yes" else "No"}
Is combat class: #{if Class == "Rogue" or Class == "Warrior" then "Yes" else "No"}
```

**Final output:**

```
Your Name:   Alex
Gender:      Male
Age:         19
Appearance:  Tall, black hair, sharp eyes
Personality: Reserved and calculating.
Class:       Rogue
Backstory:   Hails from the depths of hell.

--- Derived stats ---
Sister's age:    14
Is adult:        Yes
Is combat class: Yes
```

---

## Quick reference

### Block syntax

```
#{expression}
#{statement; statement; expression}
#{var Name = value; Name}
```

### Variable declaration

```
#{var Age = 19}
#{set Name = "Alex"}
#{var IsHero = true}
```

### Arithmetic

```
#{Age + 10}
#{Age * 2 - 1}
#{Gold % 100}
```

### String joining

```
#{"Hello, " + Name}
```

### Conditionals

```
#{if condition then valueIfTrue else valueIfFalse}
#{if condition then valueIfTrue}
#{if a then x else if b then y else z}
#{condition ? valueIfTrue : valueIfFalse}
```

### Null coalescing

```
#{value ?? fallback}
```

### Comparisons

```
Age == 19       Age != 19
Age < 18        Age > 18
Age <= 12       Age >= 65
```

### Logic

```
Age >= 18 and HasLicense
isWarrior or isRogue
not HasSword
```

### Blank checks

```
#{if Field is blank then "default" else Field}
#{if Field is not blank then Field else "default"}
```
