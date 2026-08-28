from pathlib import Path

path = Path('.github/scripts/fix_workout_session.py')
source = path.read_text()
needle = '''# Exact autosave dependency shape from the current source.
rep(
    """  }, [
    exercises,
    startedAt,
    pausedAt,""",
    """  }, [
    exercises,
    startedAt,
    sessionActive,
    pausedAt,""",
    label="autosave dependencies",
)

'''
if needle not in source:
    raise SystemExit('Could not locate redundant autosave dependency check')
source = source.replace(needle, '', 1)
exec(compile(source, str(path), 'exec'), {'__name__': '__main__'})
