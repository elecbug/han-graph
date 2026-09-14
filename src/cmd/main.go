package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/elecbug/han-graph/internal/graph"
)

func main() { os.Exit(run(os.Args[1:], os.Stdout, os.Stderr)) }

func run(args []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("han-graph", flag.ContinueOnError)
	flags.SetOutput(stderr)
	data := flags.String("data", "../dataset", "dataset directory (relative to the working directory)")
	jsonOutput := flags.Bool("json", false, "write JSON results")
	addr := flags.String("addr", "127.0.0.1:8080", "web server listening address")
	flags.Usage = func() {
		fmt.Fprintln(stderr, "Usage: han-graph [-data DIR] [-json] [-addr HOST:PORT] validate|word QUERY|character QUERY|serve")
		flags.PrintDefaults()
	}
	if err := flags.Parse(args); err != nil {
		if err == flag.ErrHelp {
			return 0
		}
		return 2
	}
	command := "validate"
	if flags.NArg() > 0 {
		command = flags.Arg(0)
	}
	if ((command == "validate" || command == "serve") && flags.NArg() > 1) ||
		(command == "serve" && *jsonOutput) ||
		((command == "word" || command == "character") && (flags.NArg() != 2 || strings.TrimSpace(flags.Arg(1)) == "")) ||
		(command != "validate" && command != "word" && command != "character" && command != "serve") {
		flags.Usage()
		return 2
	}
	g, err := graph.Load(*data)
	if err != nil {
		fmt.Fprintln(stderr, "Error:", err)
		return 1
	}
	var result any
	switch command {
	case "serve":
		return serve(g, *data, *addr, stdout, stderr)
	case "validate":
		stats := g.Stats()
		result = stats
		if !*jsonOutput {
			fmt.Fprintf(stdout, "Dataset valid: %d sound groups, %d character readings (%d unique hanja), %d words.\n", stats.Meta, stats.CharacterReadings, stats.Characters, stats.Words)
			fmt.Fprintf(stdout, "Graph: %d word-character edges, %d connected hanja.\n", stats.Edges, stats.ConnectedCharacters)
		}
	case "word":
		matches := g.FindWords(flags.Arg(1))
		result = matches
		if !*jsonOutput {
			for _, match := range matches {
				printWord(stdout, match.Word)
				for _, component := range match.Components {
					for _, reading := range component.Readings {
						fmt.Fprintf(stdout, "  %s (%s / %s): %s / %s\n", component.Hanja, reading.SoundKo, reading.SoundEn, strings.Join(reading.MeaningKo, ", "), strings.Join(reading.MeaningEn, ", "))
					}
				}
				if match.Word.SemanticHint != "" {
					fmt.Fprintln(stdout, "  Hint:", match.Word.SemanticHint)
				}
			}
			if len(matches) == 0 {
				fmt.Fprintln(stdout, "No matching words.")
			}
		}
	case "character":
		matches := g.FindCharacters(flags.Arg(1))
		result = matches
		if !*jsonOutput {
			for _, match := range matches {
				fmt.Fprintf(stdout, "%s (%s / %s) [%s]: %s / %s\n", match.Hanja, match.SoundKo, match.SoundEn, match.ID, strings.Join(match.MeaningKo, ", "), strings.Join(match.MeaningEn, ", "))
				fmt.Fprintf(stdout, "  Connected words: %d\n", len(match.Words))
				for _, word := range match.Words {
					printWord(stdout, word)
				}
			}
			if len(matches) == 0 {
				fmt.Fprintln(stdout, "No matching characters.")
			}
		}
	}
	if *jsonOutput {
		encoder := json.NewEncoder(stdout)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(result); err != nil {
			fmt.Fprintln(stderr, "Error:", err)
			return 1
		}
	}
	return 0
}

func printWord(out io.Writer, word graph.Word) {
	fmt.Fprintf(out, "%s (%s): %s / %s\n", word.Word, word.Hanja, word.MeaningKo, word.MeaningEn)
}
