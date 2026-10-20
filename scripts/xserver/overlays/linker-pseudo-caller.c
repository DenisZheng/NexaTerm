/* A nonzero imported-data initializer requires the real pseudo-relocator. */
extern int probe_values[2];
int *probe_selected = &probe_values[1];

int main(void)
{
    return *probe_selected == 23 ? 0 : 1;
}
