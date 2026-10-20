/* Authored rules probe: no display connection and no upstream implementation. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <X11/Xlib.h>
#include <X11/XKBlib.h>
#include <X11/extensions/XKBrules.h>

int main(int argc, char **argv)
{
    if (argc != 3 || (strcmp(argv[2], "us") && strcmp(argv[2], "de")))
        return 2;
    XkbRF_RulesPtr rules = XkbRF_Load(argv[1], NULL, False, True);
    if (!rules)
        return 3;
    XkbRF_VarDefsRec defs = {0};
    XkbComponentNamesRec names = {0};
    defs.model = "pc105";
    defs.layout = argv[2];
    defs.variant = "";
    defs.options = "";
    int result = 4;
    if (XkbRF_GetComponents(rules, &defs, &names) && names.keycodes && names.types &&
        names.compat && names.symbols && names.geometry) {
        if (printf("keycodes=%s\ntypes=%s\ncompat=%s\nsymbols=%s\ngeometry=%s\n",
                   names.keycodes, names.types, names.compat, names.symbols, names.geometry) > 0)
            result = 0;
    }
    free(names.keycodes);
    free(names.types);
    free(names.compat);
    free(names.symbols);
    free(names.geometry);
    free(names.keymap);
    XkbRF_Free(rules, True);
    return result;
}
