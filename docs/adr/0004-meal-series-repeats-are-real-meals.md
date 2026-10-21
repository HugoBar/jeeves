# Meal Series repeats are real Meals

A Meal Series could have been stored calendar-style, as a rule from which repeats are computed on the fly. Instead, each repeat is created as an ordinary Meal row inside the planner's two-week window, and the series keeps a "created up to" date that only moves forward. Confirmation, Projected Stock, Unconfirmed handling and Suggestions therefore treat repeats exactly like any other Meal, and a repeat deleted on its own is never recreated. The cost is that "this and all following" edits must rewrite the later Planned repeats instead of changing one rule.
